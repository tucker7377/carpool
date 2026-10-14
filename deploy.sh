#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_ID="${PROJECT_ID:-carpool-st-andrews}"
REGION="${REGION:-us-west1}"
SERVICE="carpool"
ACCOUNT="carpool-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_ACCOUNT="carpool-build@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firestore.googleapis.com iam.googleapis.com \
  --project="$PROJECT_ID" --quiet

DATABASES=$(gcloud firestore databases list --project="$PROJECT_ID" --format='value(name)')
if ! printf '%s\n' "$DATABASES" | grep -q '/databases/(default)$'; then
  gcloud firestore databases create --project="$PROJECT_ID" \
    --location="$REGION" --type=firestore-native --delete-protection --quiet
fi

ACCOUNTS=$(gcloud iam service-accounts list --project="$PROJECT_ID" --format='value(email)')
if ! printf '%s\n' "$ACCOUNTS" | grep -Fxq "$ACCOUNT"; then
  gcloud iam service-accounts create carpool-runtime --project="$PROJECT_ID" \
    --display-name="Carpool Cloud Run runtime" --quiet
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$ACCOUNT" --role=roles/datastore.user --condition=None --quiet --format=none

if ! printf '%s\n' "$ACCOUNTS" | grep -Fxq "$BUILD_ACCOUNT"; then
  gcloud iam service-accounts create carpool-build --project="$PROJECT_ID" \
    --display-name="Carpool container builds" --quiet
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_ACCOUNT" --role=roles/run.builder --condition=None --quiet --format=none

gcloud run deploy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --source=. --service-account="$ACCOUNT" --set-env-vars=STORAGE_BACKEND=firestore \
  --build-service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_ACCOUNT" \
  --no-invoker-iam-check --min-instances=0 --max-instances=1 \
  --concurrency=40 --cpu=1 --memory=256Mi --timeout=30 --quiet

gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --format='value(status.url)'
