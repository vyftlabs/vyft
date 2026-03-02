#!/usr/bin/env bash

echo "Creating job..."
RESPONSE=$(curl -s -X POST "http://localhost:8794/jobs" \
  -H "Content-Type: application/json" \
  -d '{"type":"email","payload":{"to":"user@example.com"}}')

echo "$RESPONSE" | jq .

JOB_ID=$(echo "$RESPONSE" | jq -r '.id')

echo "Waiting for job $JOB_ID to complete..."
for i in {1..10}; do
  sleep 0.5
  STATUS=$(curl -s "http://localhost:8794/jobs/$JOB_ID" | jq -r '.status')
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo "Job $STATUS:"
    curl -s "http://localhost:8794/jobs/$JOB_ID" | jq .
    exit 0
  fi
done

echo "Job did not complete within 5s:"
curl -s "http://localhost:8794/jobs/$JOB_ID" | jq .
exit 1
