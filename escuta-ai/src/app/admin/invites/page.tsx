"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";

interface Invitation {
  id: string;
  email: string | null;
  token: string;
  role: "USER" | "ADMIN";
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  createdByUser: {
    name: string | null;
    email: string;
  };
}

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] = useState("USER");
  const [error, setError] = useState("");

  const fetchInvites = async () => {
    try {
      const res = await fetch("/api/admin/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data);
      } else {
        console.error("Failed to fetch invites:", res.status);
      }
    } catch (error) {
      console.error("Erro ao buscar convites:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newInviteEmail || undefined,
          role: newInviteRole,
        }),
      });

      if (res.ok) {
        setNewInviteEmail("");
        fetchInvites();
      } else {
        const data = await res.json();
        setError(data.error || "Erro ao criar convite");
      }
    } catch (error) {
      console.error("Erro ao criar convite:", error);
      setError("Erro de conexão");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este convite?")) return;

    try {
      const res = await fetch(`/api/admin/invites/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchInvites();
      }
    } catch (error) {
      console.error("Erro ao excluir convite:", error);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `https://devilai.cid-uff.net/register?token=${token}`;
    navigator.clipboard.writeText(url);
    alert("Link copiado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Gerenciar Convites</h1>
      </div>

      {/* Form de Criação */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium mb-4">Novo Convite</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleCreateInvite} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email (Opcional)
            </label>
            <input
              type="email"
              value={newInviteEmail}
              onChange={(e) => setNewInviteEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Função
            </label>
            <select
              value={newInviteRole}
              onChange={(e) => setNewInviteRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="USER">Usuário</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Criando..." : "Gerar Convite"}
          </button>
        </form>
      </div>

      {/* Lista de Convites */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email / Token
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Função
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Criado em
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center">
                  Carregando...
                </td>
              </tr>
            ) : invites.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  Nenhum convite encontrado
                </td>
              </tr>
            ) : (
              invites.map((invite) => (
                <tr key={invite.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {invite.email || "Qualquer email"}
                    </div>
                    <div className="text-sm text-gray-500 font-mono">
                      {invite.token.substring(0, 8)}...
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      invite.role === "ADMIN" ? "bg-purple-100 text-purple-800" : "bg-green-100 text-green-800"
                    }`}>
                      {invite.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {invite.usedAt ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        Usado
                      </span>
                    ) : new Date(invite.expiresAt) < new Date() ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Expirado
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invite.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!invite.usedAt && (
                      <button
                        onClick={() => copyInviteLink(invite.token)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        Copiar Link
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteInvite(invite.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
