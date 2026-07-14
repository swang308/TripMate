import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TripMateLogo from "../components/TripMateLogo";
import { saveSession } from "../lib/api";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5050";

export default function Login(){
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");

  const pinkColor = {
    textShadow: "1px 1px 0 #fff, 2px 2px 0 rgba(255,105,180,0.3), 3px 3px 6px rgba(255,105,180,0.25)",
    fontFamily: "'Comic Sans MS', cursive",
    logo: { fontFamily: "'Comic Sans MS', cursive" },
    mainText: { textShadow: "2px 2px 0 rgba(255, 105, 180, 0.25)" },
    sectionText: { 
      textShadow: "1px 1px 0 #fff, 2px 2px 0 rgba(255,105,180,0.3), 3px 3px 6px rgba(255,105,180,0.2)" 
    },
    boxText: { 
      textShadow: "2px 2px 0 rgba(255,255,255,0.4), 3px 3px 6px rgba(0,0,0,0.15)" 
    }
  };

  const inputCls = "w-full px-4 py-3 border border-pink-200 rounded-lg focus:outline-none focus:border-pink-400 placeholder-gray-400 text-gray-700";

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validateForm = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(form.identifier.trim())) {
      setError("Please enter a valid email address");
      return false;
    }
    
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return false;
    }
    
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.identifier.trim(),
          password: form.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Invalid credentials");
      }

      saveSession({
        token: data.token,
        user: data.user,
        session: data.session,
      });

      navigate("/homepage");
    } catch (err) {
      setError(
        err instanceof Error && err.message 
          ? err.message 
          : "Could not connect to the server"
      );
    }
  };

  return (
    <div className="relative min-h-screen bg-pink-100 flex flex-col items-center px-6 py-12">
      <header className="absolute left-6 top-6 sm:left-10 sm:top-8">
        <TripMateLogo />
      </header>
      <h1 className="text-4xl sm:text-5xl font-extrabold text-pink-400 text-center mt-6 mb-10" style={pinkColor}>
        Log in to explore TripMate
      </h1>

      <form onSubmit={submit} className="w-full max-w-xl bg-white rounded-2xl shadow-lg p-8 sm:p-10">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-pink-500 font-bold mb-2">Email</label>
          <input 
            type="email"
            name="identifier" 
            value={form.identifier} 
            onChange={change} 
            placeholder="Enter your email address" 
            required 
            className={inputCls} 
          />
        </div>

        <div className="mb-4">
          <label className="block text-pink-500 font-bold mb-2">Password</label>
          <input 
            type="password" 
            name="password" 
            value={form.password} 
            onChange={change} 
            placeholder="Enter your password" 
            required 
            className={inputCls} 
          />
        </div>

        <div className="text-center mb-6">
          <Link to="/account-recovery" className="text-pink-500 underline text-sm">
            Forgot password
          </Link>
        </div>

        <button type="submit" className="w-full bg-pink-400 hover:bg-pink-500 text-white font-bold text-xl py-4 rounded-xl shadow-md">
          Log in
        </button>

        <div className="text-center mt-6">
          <Link to="/register" className="text-pink-500 underline text-sm">
            Don't have an account yet?
          </Link>
        </div>
      </form>
    </div>
  );
}
