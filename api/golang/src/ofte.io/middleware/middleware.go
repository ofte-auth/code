package middleware

import (
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
)

// OfteAuthenticate is the Authentication Service-based middleware
// handler for validating the authentication of requests
func OfteAuthenticate(endpoint string) gin.HandlerFunc {
	return func(ctx *gin.Context) {

		session := ctx.Request.Header.Get("ofte-session")
		token := ctx.Request.Header.Get("ofte-token")

		if session == "" || token == "" {
			ctx.Next()
			return
		}

		resp, err := http.PostForm(endpoint+"/t", url.Values{"session": {session}, "token": {token})
		if resp.StatusCode != http.StatusOK || err != nil {
			ctx.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		ctx.Next()
	}
}
