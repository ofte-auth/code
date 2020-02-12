FROM golang:1.10-alpine

EXPOSE 443

ADD build/portal /usr/local/bin/portal
ADD quotes.csv /srv/quotes.csv

COPY web-app /srv/web-app/

ENTRYPOINT ["/usr/local/bin/portal"]
