import { ACCOUNTS_ENABLED } from "../config";
import { navigate } from "./route";

/** "Account" in the header. Renders nothing while accounts are switched off. */
export function AccountLink() {
  if (!ACCOUNTS_ENABLED) return null;
  return (
    <a
      className="button"
      href="/account"
      onClick={(e) => {
        e.preventDefault();
        navigate("/account");
      }}
    >
      Account
    </a>
  );
}
