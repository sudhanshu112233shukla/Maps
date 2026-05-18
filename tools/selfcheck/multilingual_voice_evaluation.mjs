import { AIAssistant } from '../../src/ai/AIAssistant.js';

const EVALUATION_SET = [
  // --- English queries ---
  {
    query: "navigate to the nearest hospital avoiding toll roads",
    locale: "en-US",
    expected: {
      poi: "hospital",
      mode: "fastest",
      avoid: ["tolls"]
    }
  },
  {
    query: "take me to a gas station via the safest route avoiding highways",
    locale: "en-US",
    expected: {
      poi: "fuel",
      mode: "safest",
      avoid: ["highways"]
    }
  },
  {
    query: "route to EV charging hub using eco mode",
    locale: "en-US",
    expected: {
      poi: "charging",
      mode: "eco",
      avoid: []
    }
  },
  // --- Hinglish queries ---
  {
    query: "mujhe pass ke petrol pump par le chalo tolls ko avoid karke",
    locale: "hi-IN",
    expected: {
      poi: "fuel",
      mode: "fastest",
      avoid: ["tolls"]
    }
  },
  {
    query: "sabse safe rasta dikhao hospital jaane ke liye, traffic se bacho",
    locale: "hi-IN",
    expected: {
      poi: "hospital",
      mode: "safest",
      avoid: ["traffic"]
    }
  },
  {
    query: "kam fuel wala route dhundo EV charger station ke liye",
    locale: "hi-IN",
    expected: {
      poi: "charging",
      mode: "eco",
      avoid: []
    }
  },
  // --- Hindi queries ---
  {
    query: "नज़दीकी अस्पताल का मार्ग दिखायें बिना टोल के",
    locale: "hi-IN",
    expected: {
      poi: "hospital",
      mode: "fastest",
      avoid: ["tolls"]
    }
  },
  {
    query: "सुरक्षित रास्ता चुनिए पेट्रोल पंप के लिए और हाईवे से बचिए",
    locale: "hi-IN",
    expected: {
      poi: "fuel",
      mode: "safest",
      avoid: ["highways"]
    }
  }
];

async function main() {
  console.log("=== Running Multilingual AI Voice Evaluation Set ===");
  const assistant = new AIAssistant({ locale: "en-US" });
  await assistant.load();

  let passedCount = 0;
  let failedCount = 0;

  for (const [index, testCase] of EVALUATION_SET.entries()) {
    const { query, locale, expected } = testCase;
    assistant.options.locale = locale;
    
    const startTime = performance.now();
    const result = await assistant.parseRoutingQuery(query);
    const duration = performance.now() - startTime;

    let failed = false;
    if (expected.poi && result.poi !== expected.poi) {
      console.error(`[Fail] Case ${index + 1}: Expected POI '${expected.poi}', got '${result.poi}'`);
      failed = true;
    }
    if (expected.mode && result.mode !== expected.mode) {
      console.error(`[Fail] Case ${index + 1}: Expected Mode '${expected.mode}', got '${result.mode}'`);
      failed = true;
    }
    for (const av of expected.avoid) {
      if (!result.avoid.includes(av)) {
        console.error(`[Fail] Case ${index + 1}: Expected Avoid to contain '${av}', got [${result.avoid.join(', ')}]`);
        failed = true;
      }
    }

    if (failed) {
      failedCount++;
      console.error(`Query: "${query}" (Locale: ${locale})`);
    } else {
      passedCount++;
      console.log(`[Pass] Case ${index + 1}: "${query}" -> POI: ${result.poi}, Mode: ${result.mode}, Avoid: [${result.avoid.join(', ')}] in ${duration.toFixed(2)}ms`);
    }
  }

  console.log("\n=== Evaluation Results ===");
  console.log(`Passed: ${passedCount}/${EVALUATION_SET.length}`);
  console.log(`Failed: ${failedCount}/${EVALUATION_SET.length}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log("[ok] Multilingual evaluation suite passed successfully!");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
