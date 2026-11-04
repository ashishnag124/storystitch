import { ACCOUNTS_ENABLED } from "./config";
import { NavLink } from "./ui/NavLink";

/** "Account" in the header. Renders nothing while accounts are switched off. */
export function AccountLink() {
  return ACCOUNTS_ENABLED ? <NavLink to="/account" label="Account" /> : null;
}
