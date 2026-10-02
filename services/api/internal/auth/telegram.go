package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

var ErrInvalidTelegramInitData = errors.New("invalid telegram init data")

type TelegramUser struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name,omitempty"`
	Username     string `json:"username,omitempty"`
	LanguageCode string `json:"language_code,omitempty"`
	PhotoURL     string `json:"photo_url,omitempty"`
}

type TelegramVerifier struct {
	botToken string
	maxAge   time.Duration
	now      func() time.Time
}

func NewTelegramVerifier(botToken string, maxAge time.Duration) *TelegramVerifier {
	return &TelegramVerifier{
		botToken: strings.TrimSpace(botToken),
		maxAge:   maxAge,
		now:      time.Now,
	}
}

func (v *TelegramVerifier) Enabled() bool {
	return v.botToken != ""
}

func (v *TelegramVerifier) Verify(initData string) (TelegramUser, error) {
	if !v.Enabled() {
		return TelegramUser{}, ErrProviderNotConfigured
	}
	if len(initData) == 0 || len(initData) > 64*1024 {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	values, err := url.ParseQuery(initData)
	if err != nil {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	receivedHash := strings.TrimSpace(values.Get("hash"))
	if receivedHash == "" {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}
	receivedHashBytes, err := hex.DecodeString(receivedHash)
	if err != nil || len(receivedHashBytes) != sha256.Size {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	if !v.validHash(values, receivedHashBytes) {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	authDateRaw := strings.TrimSpace(values.Get("auth_date"))
	authDateUnix, err := strconv.ParseInt(authDateRaw, 10, 64)
	if err != nil || authDateUnix <= 0 {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	now := v.now()
	authDate := time.Unix(authDateUnix, 0)
	if authDate.After(now.Add(5 * time.Minute)) {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}
	if v.maxAge > 0 && now.Sub(authDate) > v.maxAge {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	rawUser := strings.TrimSpace(values.Get("user"))
	if rawUser == "" {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	var user TelegramUser
	if err := json.Unmarshal([]byte(rawUser), &user); err != nil {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}
	if user.ID <= 0 || strings.TrimSpace(user.FirstName) == "" {
		return TelegramUser{}, ErrInvalidTelegramInitData
	}

	user.FirstName = strings.TrimSpace(user.FirstName)
	user.LastName = strings.TrimSpace(user.LastName)
	user.Username = strings.TrimSpace(user.Username)
	user.LanguageCode = strings.TrimSpace(user.LanguageCode)
	user.PhotoURL = strings.TrimSpace(user.PhotoURL)

	return user, nil
}

func (v *TelegramVerifier) validHash(values url.Values, receivedHash []byte) bool {
	secretMac := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secretMac.Write([]byte(v.botToken))
	secret := secretMac.Sum(nil)

	// Telegram introduced an additional "signature" field for third-party
	// validation. Older clients do not send it. Accept both hash layouts so
	// the bot-token validation stays compatible across client generations.
	for _, excludeSignature := range []bool{true, false} {
		dataCheck := telegramDataCheckString(values, excludeSignature)
		mac := hmac.New(sha256.New, secret)
		_, _ = mac.Write([]byte(dataCheck))
		if hmac.Equal(mac.Sum(nil), receivedHash) {
			return true
		}
	}
	return false
}

func telegramDataCheckString(values url.Values, excludeSignature bool) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if key == "hash" || (excludeSignature && key == "signature") {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		lines = append(lines, fmt.Sprintf("%s=%s", key, values.Get(key)))
	}
	return strings.Join(lines, "\n")
}

func TelegramIdentity(user TelegramUser) ProviderIdentity {
	name := strings.TrimSpace(strings.Join(
		[]string{user.FirstName, user.LastName},
		" ",
	))
	return ProviderIdentity{
		Provider:    "telegram",
		Subject:     strconv.FormatInt(user.ID, 10),
		DisplayName: name,
		AvatarURL:   user.PhotoURL,
	}
}
