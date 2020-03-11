package ofte

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

// GinSessionAuthMiddleware validates that an Ofte session is active.
func GinSessionAuthMiddleware(ofteAuthEndpoint string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		session := ctx.Request.Header.Get("Ofte-SessionID")
		if session == "" {
			ctx.AbortWithError(400, errors.New("missing ofte session header"))
			return
		}
		var (
			err  error
			resp *http.Response
		)
		if strings.HasPrefix(ofteAuthEndpoint, "https://localhost") {
			resp, err = httpGetSkipVerify(fmt.Sprintf("%s/validate_session/%s", ofteAuthEndpoint, session))
		} else {
			resp, err = http.Get(fmt.Sprintf("%s/validate_session/%s", ofteAuthEndpoint, session))
		}
		if resp != nil {
			defer resp.Body.Close()
		}
		if err != nil || resp.StatusCode != 200 {
			ctx.AbortWithError(401, err)
			return
		}
		ctx.Next()
	}
}

// GinAccessAuthMiddleware validates that an Ofte session is active and that a one time access token exists.
func GinAccessAuthMiddleware(ofteAuthEndpoint string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		session := ctx.Request.Header.Get("Ofte-SessionID")
		accessToken := ctx.Request.Header.Get("Ofte-AccessToken")
		if session == "" || accessToken == "" {
			ctx.AbortWithError(400, errors.New("missing ofte session or access token header"))
			return
		}
		var (
			err  error
			resp *http.Response
		)
		if strings.HasPrefix(ofteAuthEndpoint, "https://localhost") {
			resp, err = httpGetSkipVerify(fmt.Sprintf("%s/validate_access/%s/%s", ofteAuthEndpoint, session, accessToken))
		} else {
			resp, err = http.Get(fmt.Sprintf("%s/validate_access/%s/%s", ofteAuthEndpoint, session, accessToken))
		}
		if resp != nil {
			defer resp.Body.Close()
		}
		if err != nil || resp.StatusCode != 200 {
			ctx.AbortWithError(401, err)
			return
		}
		ctx.Next()
	}
}
