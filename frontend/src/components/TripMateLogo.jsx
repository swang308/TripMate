import { Link } from "react-router-dom";
import logo from "../assets/tripmate-logo.svg";

export default function TripMateLogo({
  to = "/",
  className = "",
  label = "TripMate",
}) {
  return (
    <Link to={to} className={`flex items-center gap-2 ${className}`.trim()}>
      <img
        src={logo}
        alt={label}
        className="h-10 w-auto select-none"
        draggable="false"
      />
    </Link>
  );
}
