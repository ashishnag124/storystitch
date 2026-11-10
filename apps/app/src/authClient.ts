export { authClient } from "./platform/auth";

/** A friendly message for an error from the API. */
export function errorMessage(error: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (error.status === 503) return "Couldn't reach StoryStitch. Check your connection and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match.";
    case "EMAIL_NOT_VERIFIED":
      return "Please confirm your email first. We sent you a link when you signed up.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There's already an account with that email. Try signing in.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters for your password.";
    case "INVALID_PASSWORD":
      return "That password isn't right.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "That link has expired or was already used. Ask for a new one.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "VALIDATION_ERROR":
      if (error.message?.includes("email")) return "Enter a valid email address.";
      break;
    case "VERIFICATION_FAILED":
    case "MISSING_RESPONSE":
      return "The bot check didn't go through. Please try again.";
    // The API couldn't reach Cloudflare to check the token in time.
    case "UNKNOWN_ERROR":
      return "The bot check took too long. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
