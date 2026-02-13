import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import Input from "../components/ui/Input.jsx";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "user"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/users");
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => {
      const name = user.displayName?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      return name.includes(needle) || email.includes(needle);
    });
  }, [users, query]);

  const resetForm = () => {
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: "user"
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!form.firstName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const trimmedEmail = form.email.trim().toLowerCase();
    if (!emailRegex.test(trimmedEmail)) {
      setError("El email no es válido.");
      return;
    }
    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    try {
      await apiRequest("/api/users", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: trimmedEmail,
          password: form.password,
          role: form.role
        })
      });
      setSuccess("Usuario creado correctamente.");
      resetForm();
      setFormOpen(false);
      await loadUsers();
    } catch (err) {
      setError(err.message || "No se pudo crear el usuario.");
    }
  };

  return (
    <KitchenLayout>
      <Card className="kitchen-block-gap">
        <h2 className="kitchen-title-no-margin">Gestión de usuarios</h2>
        <p className="kitchen-muted">Crea y administra los accesos del equipo.</p>
        <div className="kitchen-toolbar">
          <Input
            id="search-users"
            className="kitchen-toolbar-search"
            placeholder="Buscar por nombre o email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? "Cerrar formulario" : "Crear usuario"}
          </Button>
        </div>
        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
      </Card>

      {formOpen ? (
        <Card className="kitchen-block-gap">
          <h3 className="kitchen-title-no-margin">Nuevo usuario</h3>
          <form onSubmit={onSubmit} className="kitchen-form kitchen-form-compact">
            <div className="kitchen-grid">
              <Input
                id="new-user-firstName"
                label="Nombre"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
              />
              <Input
                id="new-user-lastName"
                label="Apellidos (opcional)"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </div>
            <Input
              id="new-user-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            <Input
              id="new-user-password"
              label="Contraseña"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
            <label>
              <span className="kitchen-label">Rol</span>
              <select
                className="kitchen-select"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                <option value="admin">Admin</option>
                <option value="user">Usuario</option>
              </select>
            </label>
            <div className="kitchen-actions">
              <Button type="submit">Crear usuario</Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <div className="kitchen-muted">Cargando usuarios...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="kitchen-empty">
            <h3>Sin resultados</h3>
            <p>Prueba con otro término de búsqueda.</p>
          </div>
        ) : (
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>{user.role === "admin" ? "Admin" : "Usuario"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </KitchenLayout>
  );
}
