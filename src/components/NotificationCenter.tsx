/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { NotificationLog, Language, Teacher, UserSession } from '../types';
import { translations } from '../translations';
import { 
  Bell, 
  Send, 
  Mail, 
  Smartphone, 
  CheckCheck, 
  UserPlus, 
  Eye, 
  MessageSquare,
  AlertCircle
} from 'lucide-react';

interface NotificationCenterProps {
  lang: Language;
  session: UserSession;
  teachers: Teacher[];
  notifications: NotificationLog[];
  onAddNotification: (notification: NotificationLog) => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
}

export default function NotificationCenter({
  lang,
  session,
  teachers,
  notifications,
  onAddNotification,
  onMarkAsRead,
  onMarkAllAsRead
}: NotificationCenterProps) {
  const t = translations[lang];

  // Send Form states
  const [targetTeacherId, setTargetTeacherId] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [pushType, setPushType] = useState<'push' | 'email'>('email');

  // Trigger send alert
  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) {
      alert('Por favor, informe um título e o corpo da mensagem.');
      return;
    }

    const triggerAlert = (teacher: Teacher) => {
      onAddNotification({
        id: `n_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        timestamp: new Date().toLocaleTimeString(lang === 'pt' ? 'pt-PT' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
        recipientEmail: teacher.email,
        recipientName: teacher.name,
        title,
        message,
        sentVia: pushType,
        read: false
      });
    };

    if (targetTeacherId === 'all') {
      teachers.forEach(teacher => {
        triggerAlert(teacher);
      });
      alert(lang === 'pt' ? 'Notificação enviada com sucesso para todo o corpo docente!' : 'Notification sent to all faculty!');
    } else {
      const match = teachers.find(tchr => tchr.id === targetTeacherId);
      if (match) {
        triggerAlert(match);
        alert(lang === 'pt' ? `Notificação enviada para ${match.name}!` : `Notification sent to ${match.name}!`);
      }
    }

    // Reset Form
    setTitle('');
    setMessage('');
  };

  // Filter list depending on roles
  // Teachers only see their own emails
  const filteredNotifications = session.role === 'admin' 
    ? notifications 
    : notifications.filter(n => n.recipientEmail.toLowerCase() === session.email.toLowerCase());

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

  return (
    <div id="notification_center" className="space-y-6">
      
      {/* Overview stats layout */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-blue-500/20 border border-blue-400/30 rounded-xl flex items-center justify-center text-blue-400">
            <Bell className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white mb-0.5">
              {lang === 'pt' ? 'Central de Alertas por Email' : 'Email Notification Center'}
            </h2>
            <p className="text-slate-400 text-xs">
              {session.role === 'admin' 
                ? 'Distribua alterações manuais ou circulares oficiais para os docentes por email instantaneamente.'
                : 'Aceda aos alertas de exames e modificações de escalas enviados por email.'}
            </p>
          </div>
        </div>
        
        {unreadCount > 0 && (
          <button 
            onClick={onMarkAllAsRead}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg border border-blue-500/10 cursor-pointer"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span>{lang === 'pt' ? 'Marcar Todas como Lidas' : 'Mark All as Read'} ({unreadCount})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Dispatched alerts List (Visible both but tailored) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <span>{lang === 'pt' ? 'Histórico de Alertas Recentes' : 'Recent Alerts History'} ({filteredNotifications.length})</span>
            </h3>
            {unreadCount > 0 && (
              <span className="bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10px] animate-bounce">
                {unreadCount} {lang === 'pt' ? 'novas' : 'new'}
              </span>
            )}
          </div>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {filteredNotifications.length > 0 ? (
              filteredNotifications.slice().reverse().map((not) => (
                <div 
                  key={not.id} 
                  className={`p-4 rounded-xl border border-slate-100 transition flex items-start space-x-3.5 ${
                    not.read ? 'bg-slate-50 border-slate-100' : 'bg-blue-50/40 border-blue-100'
                  }`}
                >
                  {/* Delivery channels */}
                  <div className={`p-2.5 rounded-lg ${not.read ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-600'}`}>
                    <Mail className="h-4 w-4" />
                  </div>

                  {/* Body text */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex justify-between items-baseline text-[10px] text-slate-500 font-mono">
                      <span>{not.recipientName} ({not.recipientEmail})</span>
                      <span>{not.timestamp}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                        <span>{not.title}</span>
                        {!not.read && (
                          <span className="h-1.5 w-1.5 bg-blue-600 rounded-full inline-block" />
                        )}
                      </h4>
                      <p className="text-slate-600 text-xs mt-1 leading-relaxed">{not.message}</p>
                    </div>

                    {/* Mark individual read state */}
                    {!not.read && (
                      <button 
                        onClick={() => onMarkAsRead(not.id)}
                        className="text-[10px] text-blue-600 font-bold hover:underline block mt-1 cursor-pointer"
                      >
                        {lang === 'pt' ? 'Marcar lido' : 'Mark read'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16 text-slate-400 text-xs">
                <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p>{lang === 'pt' ? 'Nenhum alerta recebido.' : 'No alerts logged.'}</p>
                <p className="text-[10px] text-slate-400/80 mt-1">Como docente, receberá alertas quando houver alterações ao seu calendário.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Only visible for Admin (Send panel) */}
        {session.role === 'admin' ? (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 flex items-center space-x-2">
              <Send className="h-4 w-4 text-blue-500" />
              <span>{lang === 'pt' ? 'Administração: Emitir Alerta' : 'Admin: Dispatch Alert'}</span>
            </h3>

            <form onSubmit={handleSendNotification} className="space-y-4">
              {/* Recipient select */}
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                  {lang === 'pt' ? 'Destinatários' : 'Recipients'}
                </label>
                <select
                  value={targetTeacherId}
                  onChange={(e) => setTargetTeacherId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white"
                >
                  <option value="all">📢 Todos os Docentes ({teachers.length})</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      👤 {teacher.name} ({teacher.subject})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                  {lang === 'pt' ? 'Título do Alerta' : 'Alert Title'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ex. Substituição Urgente na Sala 12"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Message text */}
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                  {lang === 'pt' ? 'Mensagem' : 'Message'}
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="ex. Caro docente, devido a imprevistos, foi escalado como suplente substituto imediato..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Delivery channel indicator - Email Only */}
              <div className="flex items-center justify-center space-x-2.5 p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-blue-800 text-xs font-semibold select-none">
                <Mail className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span>{lang === 'pt' ? 'Canal de Transmissão: Correio Eletrónico (E-mail)' : 'Delivery Channel: Electronic Mail (E-mail)'}</span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg text-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{lang === 'pt' ? 'Disparar Notificações' : 'Dispatch Alerts'}</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="lg:col-span-4 bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-xl p-5 space-y-3">
            <h4 className="font-extrabold text-blue-950 text-xs uppercase tracking-wider flex items-center space-x-1.5 ml-0">
              <span>💡 Dica de Utilizador Docente</span>
            </h4>
            <p className="text-slate-900 text-xs leading-relaxed font-sans">
              Está com sessão iniciada como <strong>{session.name}</strong> ({session.email}).
            </p>
            <p className="text-slate-900 text-xs leading-relaxed font-sans">
              O seu painel pessoal de notificações lista apenas os alertas especificamente direcionados ao seu email ou enviados genericamente a todos os professores. Caso haja novos exames atribuídos, eles aparecem aqui instantaneamente eletronicamente!
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
