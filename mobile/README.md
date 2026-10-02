# FitQuest mobile

One React Native welcome screen with a backend connection check and profile intake form, built with TypeScript and Expo SDK 57.

## Start on your iPhone

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile ci
cp -n /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.example /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.local
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile start
```

Keep the Mac running and connect the iPhone to the same Wi-Fi. Open the [FitQuest development build installation page](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/761d3147-f99b-46ef-8c03-da8e82b0bc89) in iPhone Safari and install it, then scan the QR shown by the start command with the iPhone Camera. Allow local-network access if prompted. The screen says **Welcome to FitQuest.**

After the first installation, open FitQuest and select the Mac's development server, or scan the development QR again. Edit `App.tsx` to see changes through Fast Refresh. Stop the server with **Control-C** in its terminal.

If the launcher stays on “Searching for development servers”, tap **Enter URL manually**, enter the Mac's LAN URL, and tap **Connect**. For this setup the URL is `http://192.168.87.227:8081`; the Mac's Wi-Fi address may change later.

## Development build and checks

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run build:ios -- --no-wait
```

EAS project: `@nsoterop/fitquest`. The internal iPhone build uses `com.nsoterop.fitquest.dev`, separate from existing phone apps. Apple login/2FA and device prompts are handled by the owner. Use the existing account's included build credits; do not upgrade its plan or purchase extra resources.

TypeScript and Expo dependency checks run with `npm run check`. Native dependency/configuration changes need a new development build; ordinary screen edits do not. [Expo development build instructions](https://docs.expo.dev/develop/development-builds/use-development-builds/).

## Backend connection

`EXPO_PUBLIC_API_URL` in `mobile/.env.local` is the deployed Render service's **HTTPS base URL**, without `/health`: `https://fitquest-api-dpk5.onrender.com`. `.env.example` provides this public value for a fresh checkout. It is included in the mobile bundle; do not put secrets there. Restart the development server after changing the URL, then reload the phone app. No new EAS build is needed for this TypeScript/UI change.

The screen checks `GET /health` once when mounted and whenever **Retry** is tapped. It shows **Backend: Checking…**, then **Backend: Connected** only for HTTP 200 with `service: "fitquest-api"` and `status: "ok"`. Missing configuration, network/HTTP/JSON failures, and a 75-second timeout show **Backend: Unavailable**. Requests are cancelled on cleanup. Retry is disabled while checking. There is no polling or stored user data.

On 2026-10-02, the Render Docker deployment succeeded and its public `/health` response was verified independently. The owner confirmed **Backend: Connected** on the physical iPhone after a Metro refresh. TypeScript, Expo dependency checks, and 5 connection validation tests pass. The actual iOS bundle includes the configured public API URL and status UI. The existing EAS development build was reused.

## Profile intake

Scroll to **Your profile** and enter separate first and last names, height in feet and inches (including 0 inches when appropriate), age in years, weight in pounds, and gender as text. “Prefer not to say” is accepted. Numeric fields use numeric keyboards; the screen scrolls and adjusts for the iOS keyboard. Tap **Submit** to send the current values to `POST /profile-intake` at the configured HTTPS backend. Height is sent as total inches (`unit: "in"`) and weight as pounds (`unit: "lb"`).

Basic input validation happens before sending. Submit and editing are disabled while a request is pending, with an immediate lock against rapid duplicate taps. Only HTTP 200 with the exact expected message shows **User Data Saved**. Network, HTTP, invalid-response and 75-second timeout failures show an error and preserve entries for retry. Editing a field clears old feedback; unmounting cancels submission. Inputs remain in screen memory only. No profile storage, telemetry or request queue is added.

**User Data Saved** means the backend validated and acknowledged receipt. It does not mean durable storage yet. This public temporary endpoint has no private accounts; use invented details for walkthroughs.

Local typecheck, online Expo compatibility checks and all 11 mobile tests pass (5 connection tests and 6 intake validation/request tests). The iOS bundle compiled with the form and configured HTTPS URL. The initial phone error was traced to HTTP 404 on the older backend; the client now explains that missing-endpoint case specifically. Intake checkpoint `2317297` is deployed, and an invented HTTPS submission returned the exact HTTP 200 acknowledgment. On 2026-10-02, the owner confirmed successful submission on the physical iPhone after the invented-values walkthrough. No new native dependencies or EAS build were required. This requested feature is complete; no follow-on phase has started.
