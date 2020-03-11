package ofte

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"strings"

	"github.com/pkg/errors"
)

// SessionAuthMiddleware validates that an Ofte session is active.
func SessionAuthMiddleware(ofteAuthEndpoint string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := r.Header.Get("Ofte-SessionID")
			if session == "" {
				w.WriteHeader(400)
				_, _ = w.Write([]byte("header sessionid not present in request"))
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
				w.WriteHeader(401)
				_, _ = w.Write([]byte(err.Error()))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AccessAuthMiddleware validates that an Ofte session is active and that a one time access token exists.
func AccessAuthMiddleware(ofteAuthEndpoint string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := r.Header.Get("Ofte-SessionID")
			accessToken := r.Header.Get("Ofte-AccessToken")
			if session == "" || accessToken == "" {
				w.WriteHeader(400)
				_, _ = w.Write([]byte("header sessionid and/or accesstoken not present in request"))
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
				w.WriteHeader(401)
				_, _ = w.Write([]byte(err.Error()))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// httpGetSkipVerify performs an HTTP GET request, skipping the default client's verification of the
// server's certificate chain and host name. Safe only for localhost/testing as per
// (CWE-295): TLS InsecureSkipVerify set true.
func httpGetSkipVerify(url string) (*http.Response, error) {
	if !strings.HasPrefix(url, "https://localhost") {
		return nil, errors.New("skip verify only allowed to localhost")
	}
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{
		InsecureSkipVerify: true,
	}}}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, errors.Wrap(err, "error creating request")
	}
	var resp *http.Response
	if resp, err = client.Do(req); err != nil {
		return nil, errors.Wrap(err, "error communicating with ofte service")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.Errorf("ofte validation error, response code %d", resp.StatusCode)
	}
	return resp, nil
}
