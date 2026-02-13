import React from "react";

export default function AvatarStack({ users = [] }) {
  return (
    <div className="kitchen-ui-avatar-stack" aria-label="Participantes">
      {users.map((user) => (
        <span key={user.id || user.name} className="kitchen-ui-avatar" title={user.name}>
          {(user.name || "?").slice(0, 1).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
