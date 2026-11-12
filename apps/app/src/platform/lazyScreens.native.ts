import AccountScreens from "../Accounts";
import Editor from "./LayoutEditor";

// An app bundle has no download to keep small, so these are ordinary imports.
const accounts = process.env.EXPO_PUBLIC_FEATURE_ACCOUNTS === "true";

export const Accounts = accounts ? AccountScreens : null;
export const Admin = null;
export const LayoutEditor = accounts && process.env.EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR === "true" ? Editor : null;
