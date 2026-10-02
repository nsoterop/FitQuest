# FitQuest mobile

One React Native welcome screen with a backend connection check, built with TypeScript and Expo SDK 57.

## Start on your iPhone

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile ci
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

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to the deployed Render service's **HTTPS base URL**, without `/health`. `.env.example` shows the format. This value is public and is included in the mobile bundle; do not put secrets there. Restart the development server after changing the URL, then reload the phone app. No new EAS build is needed for this TypeScript/UI change.

The screen checks `GET /health` once when mounted and whenever **Retry** is tapped. It shows **Backend: Checking…**, then **Backend: Connected** only for HTTP 200 with `service: "fitquest-api"` and `status: "ok"`. Missing configuration, network/HTTP/JSON failures, and a 75-second timeout show **Backend: Unavailable**. Requests are cancelled on cleanup. Retry is disabled while checking. There is no polling or stored user data.

The owner confirmed the original welcome screen works on the iPhone. The new connection validation tests, TypeScript, and Expo dependency checks pass locally. The Render deployment and **Backend: Connected** on the physical phone are not yet verified.
