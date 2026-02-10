# Auto Flow + Nano Banana Pro Extension

Chrome extension for automating Google Flow (labs.google.com/tools/flow) with support for text-to-video, image-to-video, and Nano Banana Pro text-to-image generation.

## Project Structure

```
auto-flow-modified/
├── manifest.json       # Chrome extension manifest v3
├── background.js       # Service worker (downloads, sidepanel)
├── sidepanel.html      # Main UI with tabs (Control, Gallery, Settings, History)
├── sidepanel.js        # Sidepanel initialization
├── gateway.html/js     # Entry point / version selector
├── gallery.js          # Gallery tab - scan, select, download images
├── injector.js         # Functions injected into Flow page (DOM manipulation)
├── automation.js       # Main automation logic for all modes
├── handlers.js         # Event handlers
├── scanner.js          # Video/image scanning
├── state.js            # Global state object
├── dom.js              # DOM element references
├── config.js           # XPath selectors fetched from remote
├── settings.js         # User settings persistence
├── ui.js               # UI update functions
├── i18n.js             # Translations (Vietnamese/English)
└── language.js         # Language switching
```

## Key Features

### Modes
- **Text-to-Video**: Batch process prompts → Veo videos
- **Image-to-Video**: Upload images + prompts → Veo videos
- **Nano Banana Pro**: Text prompts → AI images (with 1K/2K/4K downloads)

### Gallery Tab (gallery.js)
- `scanFlowForImages()` - Injected into page, finds all generated images
- `refreshGallery()` - Triggers scan and renders results
- `renderGallery()` - Displays images grouped by prompt with selection
- `downloadSelectedImages()` - Downloads at chosen resolution via Flow's UI
- `downloadWithResolution()` - Injected function to click download menu

### Injector Functions (injector.js)
- `selectCreateImageMode()` - Switches Flow to "Create Image" mode
- `setImageSettings()` - Sets outputs count, aspect ratio, model (Nano Banana Pro)
- `setInitialSettings()` - Sets video mode settings (Veo model, ratio, etc.)
- `processPromptOnPage()` - Pastes prompt and clicks generate

## Important Notes

### Model Selection Bug (Fixed)
The model selector must specifically match `'Nano Banana Pro'` not just `'Nano Banana'`. Regular Nano Banana doesn't support 4K resolution downloads.

### Flow's Resolution Preference
Flow stores download resolution preference server-side per account. First download shows 1K/2K/4K menu, subsequent downloads use stored preference.

### Rate Limits
- Flow allows ~3 concurrent image downloads
- Extension batches downloads with delays to avoid issues

## Image → Video Pipeline

### Prompt Format
Use `[V#-S#]` prefix (Scene #, Video #) and `|||` delimiter to link image and video prompts:
```
[V1-S1] image prompt here ||| video prompt here
[V1-S2] image prompt here ||| video prompt here
```
The `[V#-S#]` prefix keeps prompts sorted alphabetically and organized by scene. Always include it, even for single videos, so the format stays consistent.

Example:
```
[V1-S1] Top-down shot of pancakes on a griddle, golden brown ||| Pancakes sizzle, butter melts, steam rises from surface

[V1-S2] POV hands holding coffee mug at breakfast table ||| Steam rises from mug, camera slowly pulls back
```

### Workflow
1. Select **Nano Banana Pro** mode
2. Paste prompts with `[V#-S#]` + `|||` format
3. Click **Add to Queue** → **Start**
4. Wait for images to generate
5. Go to **Gallery** → **Refresh** (auto-scrolls through entire page to find all images)
6. Select best images (click to toggle checkmark)
7. Click **→ Video** or **Merge** to add to existing job (auto-sorted alphabetically)
8. Open **Queue** → **Start** to run image-to-video

The mapping persists across sessions (saved to chrome.storage).

### Gallery Virtualization
Flow only renders images visible in the viewport. The gallery scanner scrolls through the entire page collecting images at each position, then renders them all. Each image stores its scroll position so 2K/4K downloads can scroll back to click Flow's UI menu.

## Development

1. Load unpacked in `chrome://extensions`
2. Open sidepanel on any Flow page
3. Check console logs prefixed with `[AutoFlow]` for debugging
