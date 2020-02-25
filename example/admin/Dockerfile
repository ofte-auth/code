FROM golang:1.10-alpine

EXPOSE 65444

ADD admin-prod.toml /var/lib/ofte/admin.toml
ADD build/admin /usr/local/bin/admin
ADD certs/key.pem /srv/certs/key.pem
ADD certs/cert.pem /srv/certs/cert.pem
ADD certs/ofte_256bit_symmetric.key /srv/certs/ofte_256bit_symmetric.key
ADD deploy/GeoLite2-City.mmdb /srv/deploy/GeoLite2-City.mmdb

COPY web-app /srv/web-app/

RUN \
    chmod 0400 /srv/certs/key.pem
RUN \
    chmod 0400 /srv/certs/ofte_256bit_symmetric.key
    

ENV CONFIG_SOURCE /var/lib/ofte/admin.toml
ENTRYPOINT ["/usr/local/bin/admin"]
