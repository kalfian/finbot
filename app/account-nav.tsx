import Link from "next/link";
import { LogOut, Users } from "lucide-react";

type Props = { username: string; role: "admin" | "user" };

export default function AccountNav({ username, role }: Props) {
  return <div className="account-nav">
    <span className="account-identity">{username}</span>
    {role === "admin" && <Link className="header-link" href="/users"><Users size={15} aria-hidden="true" /> Users</Link>}
    <Link className="header-link" href="/account">Account</Link>
    <form action="/api/auth/logout" method="post"><button className="header-link account-logout" type="submit"><LogOut size={15} aria-hidden="true" /> Logout</button></form>
  </div>;
}
