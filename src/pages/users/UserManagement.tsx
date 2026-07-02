import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Trash2, 
  Mail, 
  Search,
  MoreVertical,
  CheckCircle2,
  X,
  AlertCircle
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { tenantService } from '../../services/tenantService';
import { UserRole, TenantUser } from '../../types';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';

export default function UserManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('staff');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (user?.tenantId) {
      loadUsers();
    }
  }, [user?.tenantId]);

  const loadUsers = async () => {
    try {
      const data = await tenantService.getTenantUsers(user!.tenantId!);
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId) return;
    
    setInviting(true);
    try {
      await tenantService.addUserToTenant(user.tenantId, inviteEmail, inviteRole);
      showToast('Invite sent successfully!', 'success');
      setShowInviteModal(false);
      setInviteEmail('');
    } catch (error) {
      showToast('Failed to send invite', 'error');
    } finally {
      setInviting(false);
    }
  };

  if (user?.role !== 'owner') {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-center p-8">
        <div className="h-20 w-20 rounded-full bg-danger/10 flex items-center justify-center mb-6">
          <Shield className="h-10 w-10 text-danger" />
        </div>
        <h2 className="text-2xl font-black text-text tracking-tighter">Access Restricted</h2>
        <p className="text-text/60 mt-2 max-w-sm">Only store owners can manage users and roles.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-black text-text tracking-tighter mb-2">User Management</h1>
          <p className="text-text/60 font-medium">Control access levels and manage your team</p>
        </div>
        <Button 
          variant="primary" 
          className="h-14 rounded-2xl px-8 font-black uppercase tracking-widest shadow-lg shadow-primary/20"
          onClick={() => setShowInviteModal(true)}
          leftIcon={<UserPlus className="h-5 w-5" />}
        >
          Invite Team Member
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-24 bg-surface animate-pulse rounded-3xl" />)
        ) : (
          users.map((u) => (
            <Card key={u.uid} className="p-6 border-border flex items-center justify-between group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-6">
                <div className="h-14 w-14 rounded-2xl bg-text/5 flex items-center justify-center font-black text-text/40 text-xl">
                  {u.email[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="text-lg font-black text-text">{u.email}</h4>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      u.role === 'owner' ? "bg-primary/10 text-primary" : 
                      u.role === 'admin' ? "bg-info/10 text-info" : "bg-text/5 text-text/60"
                    )}>{u.role}</span>
                  </div>
                  <p className="text-xs font-bold text-text/30 mt-1 uppercase tracking-widest">
                    Joined {u.addedAt?.toDate ? u.addedAt.toDate().toLocaleDateString() : 'Recently'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {u.uid !== user?.uid && (
                  <Button variant="ghost" className="h-10 w-10 p-0 text-text/20 hover:text-danger hover:bg-danger/10">
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
                <Button variant="ghost" className="h-10 w-10 p-0 text-text/20">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInviteModal(false)}
              className="absolute inset-0 bg-text/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-surface rounded-[40px] shadow-2xl border border-border p-10 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-black text-text tracking-tighter">Invite Team Member</h3>
                <button onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-text/5 rounded-xl transition-all">
                  <X className="h-6 w-6 text-text/40" />
                </button>
              </div>

              <form onSubmit={handleInvite} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text/20" />
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@pharmacy.com"
                      className="w-full h-14 pl-12 pr-4 bg-background border border-border rounded-2xl focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Assign Role</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['admin', 'staff', 'viewer'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setInviteRole(role as UserRole)}
                        className={cn(
                          "px-4 py-3 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                          inviteRole === role ? "border-primary bg-primary/5 text-primary" : "border-border text-text/40 hover:border-text/10"
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-info/5 border border-info/10 rounded-[32px] flex items-start gap-4 mb-8">
                  <div className="p-2 bg-info/10 rounded-xl shrink-0">
                    <AlertCircle className="h-5 w-5 text-info" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-info uppercase tracking-widest mb-1">Role Permissions</h4>
                    <p className="text-[10px] font-bold text-info/60 leading-relaxed">
                      {inviteRole === 'admin' ? 'Full control except billing and owner settings.' : 
                       inviteRole === 'staff' ? 'Can manage inventory and create bills.' : 
                       'Read-only access to dashboard and reports.'}
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full h-16 rounded-[24px] font-black uppercase tracking-widest"
                  isLoading={inviting}
                >
                  Send Invitation
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
