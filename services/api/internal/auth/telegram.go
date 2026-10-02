package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/cloud"
)

var (
	ErrTelegramDisabled = errors.New("telegram auth is disabled")
	ErrTelegramInvalid  = errors.New("invalid telegram init data")
	ErrTelegramExpired  = errors.New("expired telegram init data")
)

type TelegramVerifier struct {
	botToken string
	maxAge   time.Duration
	now      func() time.Time
}

type telegramUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
	PhotoURL  string `json:"photo_url"`
}

func NewTelegramVerifier(botToken string) *TelegramVerifier {
	return &TelegramVerifier{
		botToken: strings.TrimSpace(botToken),
		maxAge:   24 * time.Hour,
		now:      time.Now,
	}
}

func (v *TelegramVerifier) Enabled() bool {
	return v != nil && v.botToken != ""
}

func (v *TelegramVerifier) Verify(initData string) (cloud.VerifiedIdentity, error) {
	if !v.Enabled() {
		return cloud.VerifiedIdentity{}, ErrTelegramDisabled
	}

	values, err := url.ParseQuery(strings.TrimSpace(initData))
	if err != nil {
		return cloud.VerifiedIdentity{}, ErrTelegramInvalid
	}

	providedHash := strings.ToLower(strings.TrimSpace(values.Get("hash")))
	if len(providedHash) != sha256.Size*2 {
		return cloud.VerifiedIdentity{}, ErrTelegramInvalid
	}

	authDate, err := strconv.ParseInt(values.Get("auth_date"), 10, 64)
	if err != nil || authDate <= 0 {
		return cloud.VerifiedIdentity{}, ErrTelegramInvalid
	}

	authTime := time.Unix(authDate, 0)
	now := v.now()
	if authTime.After(now.Add(5*time.Minute)) {
		return cloud.VerifiedIdentity{}, ErrTelegramInvalid
	}
	if v.maxAge > 0 && now.Sub(authTime) > v.maxAge {
		return cloud.VerifiedIdentity{}, ErrTelegramExpired
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		if key == "hash" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		lines = append(lines, key+"="+values.Get(key))
	}
	dataCheckString := strings.Join(lines, "\n")

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secretMAC.Write([]byte(v.botToken))
	secretKey := secretMAC.Sum(nil)

	hashMAC := hmac.New(sha256.New, secretKey)
	_, _ = hashMAC.Write([]byte(dataCheckString))
	expectedHash := hex.EncodeToString(hashMAC.Sum(nil))

	if !hmac.Equal([]byte(expectedHash), []byte(providedHash)) {
		return cloud.VerifiedIdentity{}, ErrTelegramInvalid
	}

	var user telegramUser
	if err := json.Unmarshal([]byte(values.Get("user")), &user); err != nil || user.ID == 0 {
		return cloud.VerifiedIdentity{}, ErrTelegramInvalid
	}

	displayName := strings.TrimSpace(strings.Join(
		[]string{strings.TrimSpace(user.FirstName), strings.TrimSpace(user.LastName)},
		" ",
	))
	if displayName == "" && strings.TrimSpace(user.Username) != "" {
		displayName = "@" + strings.TrimSpace(user.Username)
	}

	return cloud.VerifiedIdentity{
		Provider:      "telegram",
		Subject:       strconv.FormatInt(user.ID, 10),
		EmailVerified: false,
		DisplayName:   displayName,
		AvatarURL:     strings.TrimSpace(user.PhotoURL),
	}, nil
}
