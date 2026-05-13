use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::ffi::{c_char, CStr, CString};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone, Deserialize)]
struct Poi {
    name: String,
    #[serde(default = "default_type")]
    r#type: String,
    lng: f64,
    lat: f64,
    #[serde(default = "default_region")]
    region: String,
    #[serde(default)]
    keywords: Vec<String>,
}

fn default_type() -> String {
    "place".to_string()
}

fn default_region() -> String {
    "unknown".to_string()
}

#[derive(Debug, Clone)]
struct SearchState {
    region_id: String,
    data_version: String,
    pois: Vec<Poi>,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    name: String,
    #[serde(rename = "type")]
    category: String,
    lng: f64,
    lat: f64,
    region: String,
    score: f64,
}

static STATE: Lazy<Mutex<Option<SearchState>>> = Lazy::new(|| Mutex::new(None));

fn parse_c_string(value: *const c_char) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let cstr = unsafe { CStr::from_ptr(value) };
    cstr.to_str().ok().map(|s| s.trim().to_string())
}

fn normalize(text: &str) -> String {
    text.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != ' ', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn score_poi(poi: &Poi, query: &str) -> f64 {
    if query.is_empty() {
        return 0.0;
    }
    let name = normalize(&poi.name);
    let mut score = 0.0;
    if name == query {
        score += 240.0;
    }
    if name.starts_with(query) {
        score += 120.0;
    }
    if name.contains(query) {
        score += 80.0;
    }
    if normalize(&poi.r#type).contains(query) {
        score += 35.0;
    }
    for keyword in &poi.keywords {
        let normalized_keyword = normalize(keyword);
        if normalized_keyword == query {
            score += 60.0;
        } else if normalized_keyword.contains(query) || query.contains(&normalized_keyword) {
            score += 20.0;
        }
    }
    score
}

fn parse_pois(path: &str) -> Vec<Poi> {
    if path.is_empty() || !Path::new(path).exists() {
        return vec![];
    }
    let payload = match fs::read_to_string(path) {
        Ok(data) => data,
        Err(_) => return vec![],
    };
    serde_json::from_str::<Vec<Poi>>(&payload).unwrap_or_default()
}

fn to_c_string(payload: String) -> *const c_char {
    CString::new(payload)
        .map(CString::into_raw)
        .unwrap_or_else(|_| CString::new("{}").unwrap().into_raw())
}

#[no_mangle]
pub extern "C" fn rust_search_prepare_index(
    region_id: *const c_char,
    _graph_path: *const c_char,
    poi_path: *const c_char,
    data_version: *const c_char,
) -> bool {
    let region = parse_c_string(region_id).unwrap_or_default();
    let poi_path_value = parse_c_string(poi_path).unwrap_or_default();
    let version = parse_c_string(data_version).unwrap_or_else(|| "unversioned".to_string());

    let pois = parse_pois(&poi_path_value);
    if pois.is_empty() {
        let mut lock = STATE.lock().expect("state lock poisoned");
        *lock = Some(SearchState {
            region_id: region,
            data_version: version,
            pois: vec![],
        });
        return false;
    }

    let mut lock = STATE.lock().expect("state lock poisoned");
    *lock = Some(SearchState {
        region_id: region,
        data_version: version,
        pois,
    });
    true
}

#[no_mangle]
pub extern "C" fn rust_search_search(
    query: *const c_char,
    region_id: *const c_char,
    limit: i32,
    _bias_lng: f64,
    _bias_lat: f64,
) -> *const c_char {
    let start = Instant::now();
    let query_text = parse_c_string(query).unwrap_or_default();
    let query_norm = normalize(&query_text);
    let requested_region = parse_c_string(region_id).unwrap_or_default();
    let capped_limit = limit.clamp(1, 20) as usize;

    let lock = STATE.lock().expect("state lock poisoned");
    let state = match &*lock {
        Some(state) => state,
        None => {
            return to_c_string(json!({
                "results": [],
                "latencyMs": 0.0
            }).to_string())
        }
    };

    let mut rows: Vec<SearchResult> = state
        .pois
        .iter()
        .filter(|poi| requested_region.is_empty() || poi.region == requested_region || poi.r#type == "city")
        .filter_map(|poi| {
            let score = score_poi(poi, &query_norm);
            if score <= 0.0 {
                return None;
            }
            Some(SearchResult {
                name: poi.name.clone(),
                category: poi.r#type.clone(),
                lng: poi.lng,
                lat: poi.lat,
                region: poi.region.clone(),
                score,
            })
        })
        .collect();

    rows.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    rows.truncate(capped_limit);

    let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
    let payload = json!({
        "regionId": if requested_region.is_empty() { state.region_id.clone() } else { requested_region },
        "dataVersion": state.data_version,
        "latencyMs": latency_ms,
        "results": rows
    });

    to_c_string(payload.to_string())
}

#[no_mangle]
pub extern "C" fn rust_search_free_string(value: *mut c_char) {
    if value.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(value);
    }
}
