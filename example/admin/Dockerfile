FROM golang:1.13-alpine3.11

ADD cmd/builds/ofte-admin-demo-linux /bin/ofte-admin-demo
COPY web-app /srv/web-app/

ENTRYPOINT ["/bin/ofte-admin-demo"]