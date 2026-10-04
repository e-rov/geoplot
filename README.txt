E.ROV GeoPlot - installable web app

HOST IT (free, about 5 minutes)
1. Make a free account at github.com, create a repository (e.g. "geoplot"), upload every file in this folder.
2. Repository Settings > Pages > Source: main branch, root folder. Save.
3. After a minute it is live at https://<your-username>.github.io/geoplot/
   (Netlify Drop at app.netlify.com/drop also works: drag this folder onto the page.)

INSTALL ON ANDROID
Open the link in Chrome > menu (three dots) > "Add to Home screen" / "Install app".
It opens full-screen like a native app and keeps working offline once loaded.
Map tiles you have viewed, and the text reader once used, are cached for offline field use.
Updates: upload new files to the same place; phones pick them up the next time the app is opened online.

DIFFERENCES FROM THE claude.ai VERSION
- Satellite / street imagery shows directly in the Satellite view.
- Projects and tie points are stored on the phone (not shared). Use Projects > Export file
  and Tie points > Export CSV to move data between devices or to the shared claude.ai version.
- Photo scanning works here too, two ways (Scan to plot > Read with):
  * On this phone (free): built-in text reader. Needs internet the FIRST time only (downloads about 15 MB),
    then works offline. Good on typed, sharp, close-up photos; check every line.
  * Claude - API key (optional, most accurate on old or faded titles): paste your own Anthropic API key
    (console.anthropic.com) under "Claude API key". Each scan is billed to that key, a few US cents.
    The key is stored only on that phone; set a monthly spend limit in the console.
- Files (DXF, KML, PNG, CSV) download directly with their proper extensions; Print works.

NATIVE ANDROID LATER
core.js holds all survey math with no browser dependencies, so it can be ported to Kotlin
function-by-function, or this folder can be wrapped as an APK with Capacitor or a Trusted Web Activity (Bubblewrap).
