import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

export function NavBar() {
  const { state, logout } = useAuthContext();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="app-header">
      <div className="header-content">
        <Link to="/" className="header-logo">
          <h1>MOAbit</h1>
          <p className="tagline">Mechanism-of-action hypothesis generator</p>
        </Link>
        <nav className="header-nav">
          {state.status === "authed" ? (
            <>
              <Link to="/saved" className="nav-link">Saved</Link>
              <span className="nav-username">{state.user.name}</span>
              <button className="nav-btn" onClick={handleLogout} type="button">
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" className="nav-link">Login / Register</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
