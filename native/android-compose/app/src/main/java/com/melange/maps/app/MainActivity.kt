package com.melange.maps.app

import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.melangemaps.core.contracts.*
import com.melangemaps.core.impl.*
import kotlinx.coroutines.launch
import org.maplibre.gl.maps.MapView

class MainActivity : ComponentActivity() {
  private val searchEngine: SearchEngine = SearchEngineImpl()
  private val navigationEngine: NavigationEngine = NavigationEngineImpl()
  private val aiEngine: AiEngine = AiEngineImpl()
  private val packManager: MapPackManager = MapPackManagerImpl()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      MaterialTheme(
        colorScheme = darkColorScheme(
          primary = Color(0xFF3B82F6), // Vibrant Cobalt
          secondary = Color(0xFF10B981), // Emerald
          background = Color(0xFF0F172A), // Slate 900
          surface = Color(0xFF1E293B) // Slate 800
        )
      ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          MainDashboard(
            searchEngine = searchEngine,
            navigationEngine = navigationEngine,
            aiEngine = aiEngine,
            packManager = packManager
          )
        }
      }
    }
  }
}

@Composable
fun MapLibreView(modifier: Modifier = Modifier) {
  val context = LocalContext.current
  AndroidView(
    factory = { ctx ->
      FrameLayout(ctx).apply {
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
        // Initialize MapLibre MapView safely
        val mapView = MapView(ctx).apply {
          layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
          )
        }
        addView(mapView)
        
        // Load default style asynchronously
        mapView.getMapAsync { mapboxMap ->
          mapboxMap.setStyle("https://demotiles.maplibre.org/style.json") {
            // Offline map ready to render
          }
        }
      }
    },
    modifier = modifier
  )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainDashboard(
  searchEngine: SearchEngine,
  navigationEngine: NavigationEngine,
  aiEngine: AiEngine,
  packManager: MapPackManager
) {
  val coroutineScope = rememberCoroutineScope()
  
  // App State Variables
  var searchQuery by remember { mutableStateOf("") }
  var searchResults by remember { mutableStateOf(emptyList<SearchResult>()) }
  var activeRegion by remember { mutableStateOf("india") }
  var routeMode by remember { mutableStateOf(RouteMode.FASTEST) }
  var routeResult by remember { mutableStateOf<RouteResult?>(null) }
  
  // Pack & Download States
  var packs by remember { mutableStateOf(emptyList<RegionPack>()) }
  var activeProgress by remember { mutableStateOf<PackProgress?>(null) }
  
  // AI Panel States
  var chatMessages by remember { mutableStateOf(listOf(AiChatTurn("assistant", "Offline AI maps active. Ask for directions or stop categories!"))) }
  var userMessage by remember { mutableStateOf("") }
  var showPacksDialog by remember { mutableStateOf(false) }

  // Init Engine
  LaunchedEffect(activeRegion) {
    searchEngine.buildIndex(activeRegion)
    navigationEngine.prepare(activeRegion)
    aiEngine.prepare("en-US")
    packs = packManager.listAvailablePacks()
  }

  Box(modifier = Modifier.fillMaxSize()) {
    // 1. Map Background
    MapLibreView(modifier = Modifier.fillMaxSize())

    // 2. Main Search Overlay
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
        .align(Alignment.TopCenter)
    ) {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f), RoundedCornerShape(12.dp))
          .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        Icon(Icons.Default.Search, contentDescription = "Search", tint = Color.Gray)
        Spacer(modifier = Modifier.width(8.dp))
        TextField(
          value = searchQuery,
          onValueChange = {
            searchQuery = it
            coroutineScope.launch {
              searchResults = if (it.trim().length >= 2) {
                searchEngine.search(SearchQuery(it, "en-US", activeRegion), 5)
              } else {
                emptyList()
              }
            }
          },
          placeholder = { Text("Search offline POIs...", color = Color.Gray) },
          colors = TextFieldDefaults.textFieldColors(
            containerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent
          ),
          modifier = Modifier.weight(1f)
        )
        if (searchQuery.isNotEmpty()) {
          IconButton(onClick = {
            searchQuery = ""
            searchResults = emptyList()
          }) {
            Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color.Gray)
          }
        }
        IconButton(onClick = { showPacksDialog = true }) {
          Icon(Icons.Default.Settings, contentDescription = "Packs Manager", tint = MaterialTheme.colorScheme.primary)
        }
      }

      // Search Suggestions Overlay
      if (searchResults.isNotEmpty()) {
        Card(
          modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
          shape = RoundedCornerShape(12.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.98f))
        ) {
          LazyColumn(modifier = Modifier.heightIn(max = 240.dp)) {
            items(searchResults) { result ->
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .clickable {
                    searchQuery = result.title
                    searchResults = emptyList()
                    // Compute route automatically to chosen POI
                    coroutineScope.launch {
                      routeResult = navigationEngine.route(
                        RouteRequest(
                          origin = NavCoordinate(18.922, 72.8347), // Current Location
                          destination = result.coordinate,
                          mode = routeMode
                        )
                      )
                    }
                  }
                  .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
              ) {
                Icon(Icons.Default.Place, contentDescription = "Place", tint = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                  Text(result.title, fontWeight = FontWeight.Bold, color = Color.White)
                  Text(result.subtitle, fontSize = 12.sp, color = Color.Gray)
                }
              }
              Divider(color = Color.DarkGray)
            }
          }
        }
      }

      // Route Mode Selector Chips
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        RouteMode.values().forEach { mode ->
          val isSelected = routeMode == mode
          Box(
            modifier = Modifier
              .clip(RoundedCornerShape(20.dp))
              .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface.copy(alpha = 0.85f))
              .clickable {
                routeMode = mode
                // Recompute route
                if (searchQuery.isNotEmpty()) {
                  coroutineScope.launch {
                    routeResult = navigationEngine.route(
                      RouteRequest(
                        origin = NavCoordinate(18.922, 72.8347),
                        destination = NavCoordinate(18.9355, 72.8403),
                        mode = routeMode
                      )
                    )
                  }
                }
              }
              .padding(horizontal = 14.dp, vertical = 8.dp)
          ) {
            Text(
              text = mode.name,
              fontSize = 11.sp,
              fontWeight = FontWeight.Bold,
              color = if (isSelected) Color.White else Color.LightGray
            )
          }
        }
      }
    }

    // 3. Routing Result HUD Overlay
    routeResult?.let { result ->
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .padding(16.dp)
          .align(Alignment.CenterStart)
          .width(280.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
      ) {
        Column(modifier = Modifier.padding(16.dp)) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Navigation, contentDescription = "Nav", tint = MaterialTheme.colorScheme.secondary)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Offline Navigation HUD", fontWeight = FontWeight.Bold, color = Color.White)
          }
          Spacer(modifier = Modifier.height(8.dp))
          Text("Distance: ${(result.distanceMeters / 1000.0).toString()} km", color = Color.LightGray)
          Text("ETA: ${result.durationSeconds / 60} mins", color = Color.LightGray)
          Spacer(modifier = Modifier.height(12.dp))
          Text("Next Directions:", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = MaterialTheme.colorScheme.secondary)
          result.steps.forEach { step ->
            Text("- ${step.instruction} (${step.distanceMeters}m)", fontSize = 11.sp, color = Color.LightGray)
          }
        }
      }
    }

    // 4. AI Voice & Conversation Panel
    Card(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
        .align(Alignment.BottomCenter)
        .height(180.dp),
      shape = RoundedCornerShape(16.dp),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
    ) {
      Column(modifier = Modifier.padding(12.dp)) {
        Text("Melange Offline Assistant", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.height(6.dp))
        
        // Messages Box
        Box(modifier = Modifier.weight(1f)) {
          LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(chatMessages) { msg ->
              Text(
                text = "${if (msg.role == "user") "You" else "AI"}: ${msg.content}",
                color = if (msg.role == "user") Color.LightGray else Color.White,
                fontSize = 12.sp,
                modifier = Modifier.padding(vertical = 2.dp)
              )
            }
          }
        }

        // Input Row
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          TextField(
            value = userMessage,
            onValueChange = { userMessage = it },
            placeholder = { Text("Ask Melange navigation...", fontSize = 12.sp, color = Color.Gray) },
            colors = TextFieldDefaults.textFieldColors(
              containerColor = Color.Transparent,
              focusedIndicatorColor = Color.Transparent,
              unfocusedIndicatorColor = Color.Transparent
            ),
            modifier = Modifier.weight(1f)
          )
          IconButton(onClick = {
            if (userMessage.trim().isNotEmpty()) {
              coroutineScope.launch {
                val input = userMessage
                userMessage = ""
                val turns = chatMessages.toMutableList()
                turns.add(AiChatTurn("user", input))
                chatMessages = turns
                
                // Parse AI Intent or chat
                val intent = aiEngine.parseIntent(input, "en-US")
                val response = if (intent.poiType != null || intent.destinationText != null) {
                  routeMode = intent.mode ?: routeMode
                  "I parsed your intent to navigate using $routeMode corridor."
                } else {
                  aiEngine.chat(input, chatMessages, "en-US")
                }
                
                val finalTurns = chatMessages.toMutableList()
                finalTurns.add(AiChatTurn("assistant", response))
                chatMessages = finalTurns
              }
            }
          }) {
            Icon(Icons.Default.Send, contentDescription = "Send", tint = MaterialTheme.colorScheme.primary)
          }
          IconButton(onClick = {
            coroutineScope.launch {
              val voiceInput = aiEngine.transcribe("en-US")
              userMessage = voiceInput
            }
          }) {
            Icon(Icons.Default.Mic, contentDescription = "Voice Input", tint = MaterialTheme.colorScheme.secondary)
          }
        }
      }
    }

    // 5. Offline Region Manager Dialog
    if (showPacksDialog) {
      AlertDialog(
        onDismissRequest = { showPacksDialog = false },
        title = { Text("Offline Pack Manager", color = Color.White) },
        text = {
          Column(modifier = Modifier.fillMaxWidth()) {
            Text("Manage, download and compile regional packs with transactional status tracking.", color = Color.Gray, fontSize = 12.sp)
            Spacer(modifier = Modifier.height(8.dp))
            LazyColumn(modifier = Modifier.height(280.dp)) {
              items(packs) { pack ->
                Row(
                  modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Column {
                    Text(pack.regionId.toUpperCase(), fontWeight = FontWeight.Bold, color = Color.White)
                    Text("Version: ${pack.version}", fontSize = 11.sp, color = Color.Gray)
                    Text("Size: ${(pack.sizeBytes / 1_000_000).toString()} MB", fontSize = 11.sp, color = Color.Gray)
                  }
                  Button(
                    onClick = {
                      coroutineScope.launch {
                        packManager.install(pack.regionId) { progress ->
                          activeProgress = progress
                        }
                        activeProgress = null
                      }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                  ) {
                    Text("Download", fontSize = 11.sp)
                  }
                }
                Divider(color = Color.DarkGray)
              }
            }
            activeProgress?.let { progress ->
              Spacer(modifier = Modifier.height(12.dp))
              Text("Downloading: ${progress.regionId} (${progress.progressPercent}%)", color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.SemiBold)
              LinearProgressIndicator(
                progress = progress.progressPercent / 100f,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(top = 4.dp)
              )
            }
          }
        },
        confirmButton = {
          TextButton(onClick = { showPacksDialog = false }) {
            Text("Close", color = MaterialTheme.colorScheme.primary)
          }
        },
        containerColor = MaterialTheme.colorScheme.surface
      )
    }
  }
}
