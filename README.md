API service for Australian electricity market data.

## Run With Docker

Build the image:

```bash
docker build -t electricitygrid-api.
```

Run the container:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000\
  -e API_KEY=your-api-key \
  -e OPENELECTRICITY_API_KEY=your-openelectricity-key \
  -e S3_BUCKET-your-s3-bucket\
  -e AWS_REGION-ap-southeast-2 \
```

Check the service:

```bash
curl http://localhost:3000/v1/health
```

For protected endpoints, send the API key as a bearer token (use local-dev-token):

```bash
curl http://localhost:3000/v1/live \
  -H "Authorization: Bearer your-api-key"
```

## GitHub Container Image

The GitHub Actions workflow in `.github/workflows/docker-image-yml`:

- builds the Docker image for pull requests
- builds and pushes the image to GitHub Container Registry

Published images will use:

```text
ghcr.io/<owner>/<repo>
```
