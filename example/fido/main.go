package main

import (
	"bufio"
	"encoding/csv"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"time"

	googletoken "github.com/avivklas/GoogleIdTokenVerifier"
	"github.com/fraugster/cli"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

type quote struct {
	Quote  string
	Person string
}

var quotes []quote
var envMap = map[string]string{}

func main() {
	buildEnvMap()
	openQuoteFile()
	ctx := cli.Context()
	router, err := setupWebServer()
	if err != nil {
		log.Fatal("Error setting up webserver", err)
	}
	go router.RunTLS(":"+envMap["PORT"], envMap["CERTIFICATE_FILE"], envMap["KEY_FILE"])
	<-ctx.Done()
}

func buildEnvMap() {
	var envKeys = []string{
		"PORT",
		"OFTE_AUTH_ENDPOINT",
		"STATIC_FILES_LOCATION",
		"CERTIFICATE_FILE",
		"KEY_FILE",
		"QUOTES_FILE",
	}
	for _, key := range envKeys {
		val := os.Getenv(key)
		if val == "" {
			panic(errors.Errorf("Missing environment variable '%s'", key))
		}
		envMap[key] = val
		log.Println("Environment: ", key, ": ", val)
	}
}

func setupWebServer() (*gin.Engine, error) {
	router := gin.Default()

	router.Use(static.Serve("/", static.LocalFile(envMap["STATIC_FILES_LOCATION"], true)))

	router.POST("/login", handleLogin)
	router.GET("/quote", ofteMiddleware, handleQuote)
	return router, nil
}

func openQuoteFile() {
	csvFile, err := os.Open(envMap["QUOTES_FILE"])
	if err != nil {
		panic(errors.Wrapf(err, "opening quotes file %s", envMap["QUOTES_FILE"]))
	}
	reader := csv.NewReader(bufio.NewReader(csvFile))
	reader.Comma = ';'
	for {
		line, error := reader.Read()
		if error == io.EOF {
			break
		} else if error != nil {
			log.Fatal(error)
		}
		quotes = append(quotes, quote{
			Quote:  line[0],
			Person: line[1],
		})
	}
}

func ofteMiddleware(ctx *gin.Context) {
	session := ctx.Request.Header.Get("ofte-session")
	token := ctx.Request.Header.Get("ofte-token")
	// REST call to our services
	resp, err := http.PostForm(envMap["OFTE_AUTH_ENDPOINT"]+"/t",
		url.Values{"session": {session}, "token": {token}})
	if err != nil || resp.StatusCode != http.StatusOK {
		ctx.String(http.StatusUnauthorized, "Error validating token against the Ofte-service. Status code: %d", resp.StatusCode)
		ctx.Abort()
		return
	}
	ctx.Next()
}

func handleLogin(ctx *gin.Context) {
	googleIDToken := ctx.Query("t")
	if googleIDToken == "" {
		ctx.String(http.StatusBadRequest, "missing token id")
		ctx.Abort()
		return
	}
	tokenInfo, err := googletoken.Verify(googleIDToken,
		"964837469726-7jkq59vk4sduo9f6hutt3vdk36ch9n9m.apps.googleusercontent.com")
	if err != nil {
		ctx.String(http.StatusInternalServerError, err.Error())
		ctx.Abort()
		return
	}
	uid := tokenInfo.Email
	session := ctx.Request.Header.Get("ofte-session")
	token := ctx.Request.Header.Get("ofte-token")
	// REST call to ofte services
	resp, err := http.PostForm(envMap["OFTE_AUTH_ENDPOINT"]+"/t",
		url.Values{"session": {session}, "token": {token}, "uid": {uid}})
	if err != nil || resp.StatusCode != http.StatusOK {
		ctx.String(http.StatusUnauthorized, "Error validating user %s against the Ofte-service. Status code %d", uid, resp.StatusCode)
		ctx.Abort()
		return
	}
	ctx.AbortWithStatus(http.StatusOK)
}

// handleQuote loads a random quote. It's protected by the
// Ofte-specific middleware that validates the passed one-time token.
func handleQuote(ctx *gin.Context) {
	index := rand.Int31n(int32(len(quotes)))
	ctx.AbortWithStatusJSON(http.StatusOK, quotes[index])
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
