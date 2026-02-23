const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sanscriptCode = fs.readFileSync(path.join(__dirname, 'static', 'js', 'sanscript.js'), 'utf8');

// Create a sandbox to capture the exported object correctly
const sandbox = { module: {} };
vm.runInNewContext(sanscriptCode, sandbox);

const sans = sandbox.Sanscript;

const inputEnglish = "1. Run the prompts in order.\n*2. Manual Test: Run python main.py (no arg...";

try {
    if (!sans) {
        console.error("Sanscript object not found!");
        process.exit(1);
    }

    // Attempting to convert english to kannada directly
    console.log("Attempting conversion...");
    const result = sans.t(inputEnglish, 'itrans', 'kannada');

    console.log("✅ Success:");
    console.log(result);

} catch (err) {
    console.error("❌ Transliteration Failed:", err.message);
}
