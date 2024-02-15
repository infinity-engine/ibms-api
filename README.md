# ibms-api

To build docker image
docker build -t <image-name>

To run it
docker run -d -p 8080:8080 --env-file=env.list <image-name>
