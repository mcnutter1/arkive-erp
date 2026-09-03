"use client";

export function LogoutButton() {
  async function onLogout() {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
    });
    window.location.href = '/';
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
    >
      Logout
    </button>
  );
}
