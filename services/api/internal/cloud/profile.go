package cloud

import (
	"net/url"
	"strings"
)

func applyProfilePatch(current UserProfile, patch UserProfilePatch) (UserProfile, error) {
	if patch.DisplayName != nil {
		value := strings.TrimSpace(*patch.DisplayName)
		if len([]rune(value)) > 80 {
			return UserProfile{}, ErrInvalidProfile
		}
		current.DisplayName = value
	}

	if patch.AvatarURL != nil {
		value := strings.TrimSpace(*patch.AvatarURL)
		if len(value) > 512 {
			return UserProfile{}, ErrInvalidProfile
		}
		if value != "" {
			parsed, err := url.Parse(value)
			if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Hostname() == "" {
				return UserProfile{}, ErrInvalidProfile
			}
		}
		current.AvatarURL = value
	}

	if patch.HomeCity != nil {
		value := strings.TrimSpace(*patch.HomeCity)
		if value != "" && value != "spb" && value != "moscow" {
			return UserProfile{}, ErrInvalidProfile
		}
		current.HomeCity = value
	}

	if patch.Theme != nil {
		value := strings.TrimSpace(*patch.Theme)
		switch value {
		case "system", "light", "dark":
			current.Theme = value
		default:
			return UserProfile{}, ErrInvalidProfile
		}
	}

	return current, nil
}
