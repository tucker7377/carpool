# St. Andrew Carpool Board

A parish ride-sharing board. The server hosts `public/index.html` and the drivers API.

## Run locally

Install Node.js 24 or newer, then run:

```sh
npm ci
npm start
```

Open http://localhost:8080. Local development saves listings to `data.json`
(ignored by Git and excluded from cloud uploads). Set `DATA_DIR` to change its
location. Run `npm test` to check creation, persistence across restarts, concurrent
duplicates, token-protected deletion, and error handling.

## Deploy to Google Cloud

The deployment uses project `carpool-st-andrews`, Cloud Run service `carpool`,
and region `us-west1`. Firestore stores the listings durably; Cloud Run's local
filesystem is temporary. The runtime uses its own service account with the
Firestore User role and automatic Google credentials, without downloaded keys.
A separate `carpool-build` service account has the Cloud Run Builder role for
reading uploaded source, writing container images, and recording build logs.

With Google Cloud CLI installed and project billing enabled:

```sh
gcloud auth login
bash deploy.sh
```

The script enables the required APIs, creates the default Firestore Native
database and runtime service account if missing, grants database access, builds
the container, and deploys a public HTTPS website.
Public access uses Cloud Run's `--no-invoker-iam-check` setting, which also works
with domain-restricted sharing policies. See [Google's public access documentation](https://docs.cloud.google.com/run/docs/authenticating/public).

Your account needs permission
to enable APIs, create databases/service accounts, change project IAM, build
containers, and deploy Cloud Run services. The script prints the website URL.
Use the same command to deploy updates from your local checkout. Override
`PROJECT_ID` or `REGION` if needed; a database's location cannot be changed after
creation. Database deletion protection is enabled for newly created databases.

Cloud Run scales to zero and is capped at one instance. Google Cloud billing
still applies to builds, stored images, database operations, and hosting usage;
set a budget alert in the Cloud Console. Builds retain container images in
Artifact Registry. Sign-ups from local `data.json` are not uploaded automatically.

## Operations

```sh
# Logs
gcloud run services logs read carpool --project=carpool-st-andrews --region=us-west1

# View the deployed URL
gcloud run services describe carpool --project=carpool-st-andrews --region=us-west1 --format='value(status.url)'
```

Firestore collection `drivers` contains the listings. Expired listings stop
appearing on the board automatically; their database records remain until
removed. Administrators can remove a listing in the Firestore console.
Users remove their own listings with the token kept in their browser.
Names, cities, ride dates, and phone numbers are visible to website visitors;
deletion tokens are excluded from the public API. The board discourages search
indexing, but that is not access control. The existing spam limit is in memory
and resets when Cloud Run restarts.
