# Chrome Web Store Publishing Automation Plan

## Requirements
1. Chrome Web Store Developer account ($5 one-time fee)
2. API credentials from Google Cloud Console
3. Extension must be manually published once first

## Setup Steps
1. Create a project in Google Cloud Console
2. Enable the Chrome Web Store API
3. Create OAuth 2.0 credentials (client ID & secret)
4. Get a refresh token by authorizing once manually

## Tools for Automation

### Option 1: chrome-webstore-upload (npm package)
```bash
npx chrome-webstore-upload upload --source extension.zip
npx chrome-webstore-upload publish
```

### Option 2: GitHub Actions
Ready-made actions available:
- `mnao305/chrome-extension-upload@v4`
- `trmcnvn/chrome-addon@v2`

### Option 3: Official REST API
Endpoints for:
- Upload new version
- Publish to testers or public
- Check publish status

## Typical CI/CD Flow
1. Bump version in `manifest.json`
2. Zip the extension files
3. Upload via API
4. Publish (can auto-publish or require manual review)

## Caveats
- Google reviews can take hours to days
- Some updates trigger manual review (new permissions, etc.)
- API has rate limits

## Secrets Required for GitHub Actions
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`
- `CHROME_EXTENSION_ID` (assigned after first manual publish)
