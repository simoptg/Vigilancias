/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Teacher, Language } from '../types';
import { translations } from '../translations';
import { api } from '../utils/api';
import { 
  Plus, 
  Upload, 
  Download, 
  Trash2, 
  Edit2, 
  Search, 
  UserPlus, 
  Check, 
  X,
  FileSpreadsheet,
  Calendar
} from 'lucide-react';

interface TeacherManagerProps {
  lang: Language;
  teachers: Teacher[];
  onAddTeacher: (teacher: Teacher) => void;
  onUpdateTeacher: (teacher: Teacher) => void;
  onDeleteTeacher: (id: string) => void;
  onClearAllTeachers: () => void;
  onBulkImport: (teachers: Teacher[]) => void;
}

export default function TeacherManager({
  lang,
  teachers,
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  onClearAllTeachers,
  onBulkImport
}: TeacherManagerProps) {
  const t = translations[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // States for Unavailability Modal
  const [unavailabilityTeacher, setUnavailabilityTeacher] = useState<Teacher | null>(null);
  const [unavailDate, setUnavailDate] = useState('');
  const [unavailTime, setUnavailTime] = useState<'all' | '09:00' | '14:00'>('all');

  // Form state
  const [name, setName] = useState('');
  const [subjectGroup, setSubjectGroup] = useState('300');
  const [subject, setSubject] = useState('');
  const [role, setRole] = useState('professor');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [available, setAvailable] = useState(true);

  // Roles state for dropdown
  const [availableRoles, setAvailableRoles] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const rolesData = await api.roles.getAll();
        setAvailableRoles(rolesData);
      } catch (err) {
        console.error('Error loading roles for dropdown:', err);
      }
    };
    fetchRoles();
  }, [isModalOpen]);

  // CSV Drag state
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvAlert, setCsvAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Confirm Clear states
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const clearTimerRef = useRef<any>(null);

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingTeacher(null);
    setName('');
    setSubjectGroup('300');
    setSubject('');
    setRole('Professor');
    setEmail('');
    setPhone('');
    setAvailable(true);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setName(teacher.name);
    setSubjectGroup(teacher.subjectGroup);
    setSubject(teacher.subject);
    setRole(teacher.role);
    setEmail(teacher.email);
    setPhone(teacher.phone || '');
    setAvailable(teacher.available);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !email) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (editingTeacher) {
      onUpdateTeacher({
        ...editingTeacher,
        name,
        subjectGroup,
        subject,
        role,
        email,
        phone,
        available
      });
    } else {
      onAddTeacher({
        id: `t_${Date.now()}`,
        name,
        subjectGroup,
        subject,
        role,
        email,
        phone,
        available
      });
    }
    setIsModalOpen(false);
  };

  // XLSX excel parsing function
  const parseXLSXFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;
        
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rows.length < 2) {
          setCsvAlert({ 
            type: 'error', 
            message: lang === 'pt' ? 'Ficheiro Excel vazio ou sem cabeçalhos.' : 'Excel file is empty or missing headers.' 
          });
          return;
        }

        const headers = rows[0].map((h: any) => String(h || '').trim().toLowerCase());
        
        const newTeachers: Teacher[] = [];

        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i];
          if (!cells || cells.length === 0) continue;

          // Check if row is completely empty
          if (cells.every((c: any) => c === null || c === undefined || String(c).trim() === '')) {
            continue;
          }

          let nameIdx = headers.findIndex(h => h.includes('nome') || h.includes('name'));
          let groupIdx = headers.findIndex(h => h.includes('grupo') || h.includes('group'));
          let subjIdx = headers.findIndex(h => (h.includes('disciplina') || h.includes('subject')) && !h.includes('grupo') && !h.includes('group'));
          let roleIdx = headers.findIndex(h => h.includes('cargo') || h.includes('vinculo') || h.includes('role') || h.includes('exercido'));
          let emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));

          if (nameIdx === -1) nameIdx = 0;
          if (groupIdx === -1) groupIdx = 1;
          if (subjIdx === -1) subjIdx = 2;
          if (roleIdx === -1) roleIdx = 3;
          if (emailIdx === -1) emailIdx = 4;

          const parsedName = String(cells[nameIdx] || '').trim();
          const parsedGroup = String(cells[groupIdx] || '300').trim();
          const parsedSubj = String(cells[subjIdx] || 'Geral').trim();
          const parsedRole = (cells[roleIdx] !== undefined && cells[roleIdx] !== null && String(cells[roleIdx]).trim() !== '') 
            ? String(cells[roleIdx]).trim() 
            : 'Professor';
          const parsedEmail = String(cells[emailIdx] || `docente.${Math.floor(Math.random()*10000)}@escola.pt`).trim();

          if (!parsedName) {
            continue;
          }

          newTeachers.push({
            id: `t_xlsx_${Date.now()}_${i}`,
            name: parsedName,
            subjectGroup: parsedGroup,
            subject: parsedSubj,
            role: parsedRole,
            email: parsedEmail,
            phone: '',
            available: true
          });
        }

        if (newTeachers.length > 0) {
          onBulkImport(newTeachers);
          setCsvAlert({
            type: 'success',
            message: lang === 'pt' 
              ? `Sucesso: ${newTeachers.length} docentes importados do ficheiro Excel (.xlsx)!`
              : `Success: ${newTeachers.length} teachers imported from the Excel (.xlsx) file!`
          });
        } else {
          setCsvAlert({ 
            type: 'error', 
            message: lang === 'pt' ? 'Dados inválidos ou vazios no ficheiro Excel.' : 'No valid teacher data detected in Excel file.' 
          });
        }
      } catch (err) {
        console.error(err);
        setCsvAlert({ 
          type: 'error', 
          message: lang === 'pt' ? 'Erro ao ler o ficheiro Excel (.xlsx).' : 'Error reading the Excel (.xlsx) file.' 
        });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseXLSXFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    parseXLSXFile(file);
  };

  // Generate a mock Excel .xlsx template using the xlsx library
  const handleDownloadTemplate = () => {
    const data = [
      {
        "Nome": "Dr. Manuel Silva",
        "Grupo Disciplinar": "500",
        "Disciplina": "Matemática",
        "Cargo Exercido": "Professor de Quadro",
        "Email": "manuel.silva@escola.pt"
      },
      {
        "Nome": "Dra. Sandra Santos",
        "Grupo Disciplinar": "300",
        "Disciplina": "Português",
        "Cargo Exercido": "Professor de Quadro",
        "Email": "sandra.santos@escola.pt"
      },
      {
        "Nome": "Dr. João Costa",
        "Grupo Disciplinar": "510",
        "Disciplina": "Física e Química",
        "Cargo Exercido": "Professor Contratado",
        "Email": "joao.costa@escola.pt"
      },
      {
        "Nome": "Dra. Maria Mendes",
        "Grupo Disciplinar": "430",
        "Disciplina": "Biologia e Geologia",
        "Cargo Exercido": "Professor de Quadro",
        "Email": "maria.mendes@escola.pt"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Professores");
    
    // Auto-fit column widths
    const max_width = data.reduce((w, r) => Math.max(w, r.Nome.length), 10);
    worksheet["!cols"] = [{ wch: max_width + 5 }];

    XLSX.writeFile(workbook, "modelo_professores.xlsx");
  };

  const handleClearAllClick = () => {
    if (isConfirmingClear) {
      onClearAllTeachers();
      setIsConfirmingClear(false);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    } else {
      setIsConfirmingClear(true);
      clearTimerRef.current = setTimeout(() => {
        setIsConfirmingClear(false);
      }, 4050); // 4 seconds timeframe
    }
  };

  // Filter teachers list
  const filteredTeachers = teachers.filter(tchr => {
    const term = searchTerm.toLowerCase();
    return (
      tchr.name.toLowerCase().includes(term) ||
      tchr.subject.toLowerCase().includes(term) ||
      tchr.subjectGroup.includes(term) ||
      tchr.role.toLowerCase().includes(term)
    );
  });

  return (
    <div id="teacher_manager" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.teacherTitle}</h2>
          <p className="text-slate-500 text-xs">{t.teacherSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {teachers.length > 0 && (
            <button
              onClick={handleClearAllClick}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition border cursor-pointer ${
                isConfirmingClear
                  ? 'bg-rose-600 hover:bg-rose-750 text-white border-rose-600 animate-pulse'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>
                {isConfirmingClear 
                  ? (lang === 'pt' ? 'Confirmar Remoção?' : 'Confirm Delete All?') 
                  : (lang === 'pt' ? 'Remover Todos' : 'Remove All')}
              </span>
            </button>
          )}

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition border border-slate-200 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t.csvTemplate}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition border border-slate-200 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{t.importCsv}</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx"
            className="hidden"
          />
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.addTeacher}</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Visual Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50/50 text-blue-800' 
            : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-500'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          <FileSpreadsheet className={`h-8 w-8 ${isDragOver ? 'text-blue-500 animate-bounce' : 'text-slate-400'}`} />
          <p className="text-xs font-medium">{t.csvDropZone}</p>
          <p className="text-[10px] text-slate-400">
            Formato: Nome, Grupo Disciplinar, Disciplina, Cargo Exercido, Email
          </p>
        </div>
      </div>

      {/* Status Warning Alerts */}
      {csvAlert && (
        <div 
          className={`px-4 py-3 rounded-lg text-xs flex justify-between items-center ${
            csvAlert.type === 'success' 
              ? 'bg-blue-50 border border-blue-250 text-blue-900' 
              : 'bg-red-50 border border-red-200 text-red-900'
          }`}
        >
          <p>{csvAlert.message}</p>
          <button onClick={() => setCsvAlert(null)} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search Input filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center space-x-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t.searchTeacher}
          className="flex-1 text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600 text-xs">
            {lang === 'pt' ? 'Limpar' : 'Clear'}
          </button>
        )}
      </div>

      {/* Teachers list and directory table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-550/80 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="px-5 py-3">{t.teacherName}</th>
                <th className="px-5 py-3 text-center">{t.subjectGroup}</th>
                <th className="px-5 py-3">{t.subject}</th>
                <th className="px-5 py-3">{t.role}</th>
                <th className="px-5 py-3">{t.email}</th>
                <th className="px-5 py-3 text-center">{t.available}</th>
                <th className="px-5 py-3 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredTeachers.length > 0 ? (
                filteredTeachers.map((tc) => (
                  <tr key={tc.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3 font-semibold text-slate-900">{tc.name}</td>
                    <td className="px-5 py-3 text-center font-mono">{tc.subjectGroup}</td>
                    <td className="px-5 py-3">{tc.subject}</td>
                    <td className="px-5 py-3">
                      <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-medium">
                        {availableRoles.find(r => r.id === tc.role)?.name || tc.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-500">{tc.email}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => onUpdateTeacher({ ...tc, available: !tc.available })}
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                          tc.available 
                            ? 'bg-blue-55 text-blue-700 border border-blue-200' 
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {tc.available ? (lang === 'pt' ? 'SIM' : 'YES') : (lang === 'pt' ? 'NÃO' : 'NO')}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => {
                            setUnavailabilityTeacher(tc);
                            setUnavailDate('');
                            setUnavailTime('all');
                          }}
                          title={t.manageUnavailability}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition cursor-pointer"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(tc)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteTeacher(tc.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    Nenhum docente encontrado de momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingTeacher ? t.editTeacher : t.addTeacher}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  {t.teacherName} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. Professor Doutor Manuel Antunes"
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t.subjectGroup} *
                  </label>
                  <input
                    type="text"
                    required
                    value={subjectGroup}
                    onChange={(e) => setSubjectGroup(e.target.value)}
                    placeholder="ex. 500 para Matemática"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t.subject} *
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="ex. Matemática, Português, Física"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t.role}
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">{lang === 'pt' ? 'Selecionar Cargo...' : 'Select Role...'}</option>
                    {availableRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t.email} *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex. docente@escola.pt"
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="v-available"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label id="available_label" htmlFor="v-available" className="text-xs text-slate-700 font-medium">
                  {t.available}
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Unavailabilities Modal */}
      {unavailabilityTeacher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-slide-up">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  {t.unavailabilityTitle}
                </h3>
                <p className="text-[10px] text-slate-500 font-medium font-sans">
                  {unavailabilityTeacher.name} ({unavailabilityTeacher.subject})
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setUnavailabilityTeacher(null)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-full hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Form to add a new blockout slot */}
              <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/60 space-y-3">
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider font-sans">
                  {t.addUnavailability}
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-550 uppercase tracking-wider mb-1">
                      {t.date}
                    </label>
                    <input
                      type="date"
                      required
                      value={unavailDate}
                      onChange={(e) => setUnavailDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-550 uppercase tracking-wider mb-1">
                      {lang === 'pt' ? 'Período' : 'Time Slot'}
                    </label>
                    <select
                      value={unavailTime}
                      onChange={(e) => setUnavailTime(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="all">{t.allDay}</option>
                      <option value="09:00">{t.morning}</option>
                      <option value="14:00">{t.afternoon}</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={!unavailDate}
                    onClick={() => {
                      if (!unavailDate) return;
                      const currentUnavailabilities = unavailabilityTeacher.unavailabilities || [];
                      // Prevent duplicate date + times
                      const isDup = currentUnavailabilities.some(u => u.date === unavailDate && u.time === unavailTime);
                      if (isDup) {
                        alert(lang === 'pt' ? 'Esta indisponibilidade já se encontra registada.' : 'This unavailability is already listed.');
                        return;
                      }
                      const newUn = {
                        id: `un_${Date.now()}`,
                        date: unavailDate,
                        time: unavailTime
                      };
                      const updated = {
                        ...unavailabilityTeacher,
                        unavailabilities: [...currentUnavailabilities, newUn]
                      };
                      onUpdateTeacher(updated);
                      setUnavailabilityTeacher(updated);
                      setUnavailDate('');
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lang === 'pt' ? 'Adicionar' : 'Add'}</span>
                  </button>
                </div>
              </div>

              {/* Current registered unavailabilities list */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-sans">
                  {lang === 'pt' ? 'Indisponibilidades Registadas' : 'Registered Unavailabilities'}
                </h4>

                <div className="border border-slate-150 rounded-xl overflow-hidden bg-white max-h-[160px] overflow-y-auto">
                  {unavailabilityTeacher.unavailabilities && unavailabilityTeacher.unavailabilities.length > 0 ? (
                    <div className="divide-y divide-slate-100 text-xs">
                      {unavailabilityTeacher.unavailabilities
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((un) => (
                          <div key={un.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/55 transition">
                            <div className="flex items-center space-x-3">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <div className="font-mono text-xs font-semibold text-slate-800">
                                {un.date}
                              </div>
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-sans">
                                {un.time === 'all' ? t.allDay : (un.time === '09:00' ? t.morning : t.afternoon)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const currentUnavailabilities = unavailabilityTeacher.unavailabilities || [];
                                const updatedUnavailabilities = currentUnavailabilities.filter(u => u.id !== un.id);
                                const updated = {
                                  ...unavailabilityTeacher,
                                  unavailabilities: updatedUnavailabilities
                                };
                                onUpdateTeacher(updated);
                                setUnavailabilityTeacher(updated);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-xs text-slate-400 italic">
                      {t.noUnavailabilities}
                    </p>
                  )}
                </div>
              </div>

              {/* Close Button footer */}
              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUnavailabilityTeacher(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-md"
                >
                  {lang === 'pt' ? 'Concluir' : 'Done'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
