package cloud

import "strings"

func normalizeIdentity(identity VerifiedIdentity) (VerifiedIdentity, error) {
	identity.Provider = strings.ToLower(strings.TrimSpace(identity.Provider))
	identity.Subject = strings.TrimSpace(identity.Subject)
	identity.Email = strings.ToLower(strings.TrimSpace(identity.Email))
	identity.DisplayName = strings.TrimSpace(identity.DisplayName)
	identity.AvatarURL = strings.TrimSpace(identity.AvatarURL)

	if identity.Provider != "google" && identity.Provider != "apple" {
		return VerifiedIdentity{}, ErrInvalidProfile
	}
	if identity.Subject == "" || len(identity.Subject) > 512 {
		return VerifiedIdentity{}, ErrInvalidProfile
	}
	if len(identity.Email) > 320 || len([]rune(identity.DisplayName)) > 80 || len(identity.AvatarURL) > 512 {
		return VerifiedIdentity{}, ErrInvalidProfile
	}
	if !identity.EmailVerified {
		identity.Email = ""
	}

	return identity, nil
}

func identityKey(provider, subject string) string {
	return strings.ToLower(strings.TrimSpace(provider)) + "|" + strings.TrimSpace(subject)
}
