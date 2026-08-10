import * as XLSX from 'xlsx';
import { Teacher, Exam, Room, Language, TeacherUnavailability } from '../types';

export interface ImportedTeacherRow {
  name: string;
  subject_group?: string | null;
  subject?: string | null;
  role?: string | null;
  email?: string | null;
  available?: boolean | null;
  EE?: boolean | null;
  PISO_ZERO?: boolean | null;
  unavailabilities?: TeacherUnavailability[] | null;
  rawName: string;
  hasName: boolean;
  hasSubjectGroup: boolean;
  hasSubject: boolean;
  hasRole: boolean;
  hasEmail: boolean;
  hasAvailable: boolean;
  hasEE: boolean;
  hasPisoZero: boolean;
  hasUnavailabilities: boolean;
  invalidUnavailabilitiesText?: string | null;
  rowIndex: number;
}


export const exportToExcel = (
  teachers: Teacher[],
  exams: Exam[],
  rooms: Room[],
  roles: { id: string; name: string; priority?: number }[]
) => {
  const wb = XLSX.utils.book_new();

  // 1. Teachers Sheet
  const teachersData = teachers.map(t => ({
    Nome: t.name,
    Grupo_Disciplinar: t.subject_group,
    Disciplina: t.subject,
    Cargo: roles.find(r => r.id === t.role)?.name || t.role || '',
    Email: t.email || '',
    Disponivel: t.available ? 'SIM' : 'NÃO',
    EE: t.EE ? 'SIM' : 'NÃO',
    PISO_ZERO: t.PISO_ZERO ? 'SIM' : 'NÃO',
    Indisponibilidades: JSON.stringify(t.unavailabilities || [])
  }));
  const wsTeachers = XLSX.utils.json_to_sheet(teachersData);
  XLSX.utils.book_append_sheet(wb, wsTeachers, "Docentes");

  // 2. Exams Sheet
  const examsData = exams.map(e => ({
    Nome: e.name,
    Variante: e.variant || '',
    Grupo_Disciplinar: e.subject_group,
    Ano: e.year,
    Codigo: e.code || '',
    Data: e.date,
    Hora: e.time,
    Turno: e.shift || '',
    Modalidade: e.modality || '',
    Fase: e.phase,
    N_Inscritos: e.registrationsCount || 0,
    EE: e.EE ? 'SIM' : 'NÃO'
  }));
  const wsExams = XLSX.utils.json_to_sheet(examsData);
  XLSX.utils.book_append_sheet(wb, wsExams, "Exames");

  // 3. Rooms Sheet
  const roomsData = rooms.map(r => ({
    Nome: r.name,
    Capacidade: r.capacity,
    Floor: r.floor || '',
    priority: r.priority
  }));
  const wsRooms = XLSX.utils.json_to_sheet(roomsData);
  XLSX.utils.book_append_sheet(wb, wsRooms, "Salas");

  // 4. Roles Sheet
  const rolesData = [...roles]
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map(r => ({
      Nome: r.name,
      Ordem: r.priority ?? 0
    }));
  const wsRoles = XLSX.utils.json_to_sheet(rolesData);
  XLSX.utils.book_append_sheet(wb, wsRoles, "Cargos");

  // Save File
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Backup_Vigilancias_${dateStr}.xlsx`);
};

export const importFromExcel = async (
  file: File,
  roles: { id: string, name: string }[]
): Promise<{
  teachers: Partial<Teacher>[],
  exams: Partial<Exam>[],
  rooms: Partial<Room>[],
  roles: { name: string }[],
  sheetsPresent: {
    Docentes: boolean;
    Exames: boolean;
    Salas: boolean;
    Cargos: boolean;
  };
}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const sheetsPresent = {
          Docentes: Boolean(workbook.Sheets["Docentes"]),
          Exames: Boolean(workbook.Sheets["Exames"]),
          Salas: Boolean(workbook.Sheets["Salas"]),
          Cargos: Boolean(workbook.Sheets["Cargos"])
        };

        const getSheetData = (name: string) => {
          const ws = workbook.Sheets[name];
          return ws ? XLSX.utils.sheet_to_json(ws) : [];
        };

        // 1. Roles
        const rawRoles = sheetsPresent.Cargos ? (getSheetData("Cargos") as any[]) : [];
        const importedRoles = rawRoles.map((r, index) => ({
          name: String(r.Nome),
          priority: Number(r.Ordem ?? r.ordem ?? index + 1) || index + 1
        }));

        // 2. Rooms
        const rawRooms = sheetsPresent.Salas ? (getSheetData("Salas") as any[]) : [];
        const importedRooms = rawRooms.map(r => ({
        name: String(r.Nome),
        capacity: Number(r.Capacidade) || 15,
        floor: r.Floor !== undefined && r.Floor !== null ? String(r.Floor) : undefined,
        priority: Number(r.priority) || 0
      }));

        // 3. Teachers
        const rawTeachers = sheetsPresent.Docentes ? (getSheetData("Docentes") as any[]) : [];
        const importedTeachers = rawTeachers.map(t => {
          let unavailabilities = [];
          try {
            if (t.Indisponibilidades) {
              unavailabilities = JSON.parse(t.Indisponibilidades);
            }
          } catch (e) {
            unavailabilities = [];
          }
          return {
            name: String(t.Nome),
            subject_group: String(t.Grupo_Disciplinar || '300'),
            subject: String(t.Disciplina || 'Geral'),
            role: String(t.Cargo || ''), // Will be mapped to ID in the API/Handler
            email: t.Email ? String(t.Email) : null,
            available: String(t.Disponivel || 'NÃO').toUpperCase() === 'SIM',
            EE: String(t.EE || 'NÃO').toUpperCase() === 'SIM',
            PISO_ZERO: String(t.PISO_ZERO || 'NÃO').toUpperCase() === 'SIM',
            unavailabilities
          };
        });

        // 4. Exams
        const rawExams = sheetsPresent.Exames ? (getSheetData("Exames") as any[]) : [];
        const importedExams = rawExams.map(e => {
          const modality = e.Modalidade ? String(e.Modalidade) : null;
          const eeFromColumn = String(e.EE || 'NÃO').toUpperCase() === 'SIM';
          const eeFromModality = String(modality || '').trim().toUpperCase() === 'EE';
          return {
            name: String(e.Nome),
            variant: e.Variante ? String(e.Variante) : null,
            subject_group: String(e.Grupo_Disciplinar || '300'),
            year: String(e.Ano || '12'),
            code: e.Codigo ? String(e.Codigo) : null,
            date: String(e.Data),
            time: String(e.Hora),
            shift: e.Turno ? String(e.Turno) : null,
            modality,
            phase: String(e.Fase || '1'),
            registrationsCount: Number(e.N_Inscritos || 0),
            EE: eeFromColumn || eeFromModality
          };
        });

        resolve({
          teachers: importedTeachers,
          exams: importedExams,
          rooms: importedRooms,
          roles: importedRoles,
          sheetsPresent
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};

function getCellRaw(raw: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      const v = raw[key];
      if (v !== undefined && v !== null) return v;
    }
  }
  return null;
}

function isCellFilled(raw: Record<string, any>, keys: string[]): boolean {
  const v = getCellRaw(raw, keys);
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

function parseYesNoBool(rawValue: any): boolean | null {
  if (rawValue === null || rawValue === undefined) return null;
  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'number') return rawValue !== 0;
  const s = String(rawValue).trim().toUpperCase();
  if (!s) return null;
  if (['SIM', 'S', 'YES', 'Y', 'TRUE', '1', 'VERDADEIRO', 'V'].includes(s)) return true;
  if (['NÃO', 'NAO', 'N', 'NO', 'FALSE', '0', 'FALSO', 'F'].includes(s)) return false;
  return null;
}

function normalizeTeacherRole(roleValue: any, roles: { id: string; name: string }[]): string | null {
  if (roleValue === null || roleValue === undefined) return null;
  const raw = String(roleValue).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const exactId = roles.find(r => r.id === raw);
  if (exactId) return exactId.id;
  const exactName = roles.find(r => r.name.toLowerCase() === lower);
  if (exactName) return exactName.id;
  return raw;
}

function parseUnavailabilities(rawValue: any): {
  value: TeacherUnavailability[] | null;
  invalidText: string | null;
} {
  if (rawValue === null || rawValue === undefined) {
    return { value: null, invalidText: null };
  }
  if (typeof rawValue === 'object' && Array.isArray(rawValue)) {
    return {
      value: rawValue.filter(u => u && typeof u === 'object').map((u, idx) => ({
        id: String(u.id || `imp_${Date.now()}_${idx}`),
        date:
          u.date === 'all' || u.date === 'Todas as datas' || u.date === 'All dates'
            ? 'all'
            : String(u.date ?? ''),
        time: u.time === '09:00' || u.time === '14:00' || u.time === 'all' ? u.time : 'all',
        year: u.year ? String(u.year) : undefined,
        subject_group: u.subject_group ? String(u.subject_group) : undefined
      })),
      invalidText: null
    };
  }
  const text = String(rawValue).trim();
  if (!text) return { value: null, invalidText: null };
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { value: null, invalidText: 'Indisponibilidades não é uma lista' };
    }
    return {
      value: parsed.filter(u => u && typeof u === 'object').map((u, idx) => ({
        id: String(u.id || `imp_${Date.now()}_${idx}`),
        date:
          u.date === 'all' || u.date === 'Todas as datas' || u.date === 'All dates'
            ? 'all'
            : String(u.date ?? ''),
        time: u.time === '09:00' || u.time === '14:00' || u.time === 'all' ? u.time : 'all',
        year: u.year ? String(u.year) : undefined,
        subject_group: u.subject_group ? String(u.subject_group) : undefined
      })),
      invalidText: null
    };
  } catch {
    return { value: null, invalidText: text };
  }
}

export const importTeachersFromExcel = async (
  file: File,
  roles: { id: string; name: string }[]
): Promise<{
  rows: ImportedTeacherRow[];
}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const wsName =
          workbook.Sheets['Docentes'] !== undefined
            ? 'Docentes'
            : Object.keys(workbook.Sheets)[0];
        const ws = wsName ? workbook.Sheets[wsName] : undefined;
        const rowsRaw = ws ? (XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, any>[]) : [];

        const rows: ImportedTeacherRow[] = rowsRaw.map((raw, idx) => {
          const nameRaw = getCellRaw(raw, ['Nome', 'Name', 'Professor', 'Teacher', 'Docente']);
          const subjectGroupRaw = getCellRaw(raw, [
            'Grupo Disciplinar',
            'Grupo_Disciplinar',
            'Grupo',
            'Subject Group',
            'Group'
          ]);
          const subjectRaw = getCellRaw(raw, ['Disciplina', 'Subject', 'UC']);
          const roleRaw = getCellRaw(raw, ['Cargo', 'Role', 'Função', 'Funcao']);
          const emailRaw = getCellRaw(raw, ['Email', 'E-mail', 'Correio', 'Mail']);
          const availableRaw = getCellRaw(raw, [
            'Disponível',
            'Disponivel',
            'Disponivel',
            'Available'
          ]);
          const eeRaw = getCellRaw(raw, ['EE']);
          const pisoZeroRaw = getCellRaw(raw, ['Piso 0', 'PISO_ZERO', 'PisoZero', 'Piso0']);
          const unavailRaw = getCellRaw(raw, [
            'Indisponibilidades',
            'Unavailabilities',
            'Indisponibilidades'
          ]);

          const unavailParsed = parseUnavailabilities(unavailRaw);

          const hasSubjectGroup = isCellFilled(raw, [
            'Grupo Disciplinar',
            'Grupo_Disciplinar',
            'Grupo',
            'Subject Group',
            'Group'
          ]);
          const hasSubject = isCellFilled(raw, ['Disciplina', 'Subject', 'UC']);
          const hasRole = isCellFilled(raw, ['Cargo', 'Role', 'Função', 'Funcao']);
          const hasEmail = isCellFilled(raw, ['Email', 'E-mail', 'Correio', 'Mail']);
          const hasAvailable = isCellFilled(raw, [
            'Disponível',
            'Disponivel',
            'Disponivel',
            'Available'
          ]);
          const hasEE = isCellFilled(raw, ['EE']);
          const hasPisoZero = isCellFilled(raw, ['Piso 0', 'PISO_ZERO', 'PisoZero', 'Piso0']);
          const hasUnavailabilities = isCellFilled(raw, [
            'Indisponibilidades',
            'Unavailabilities',
            'Indisponibilidades'
          ]);

          const nameStr = nameRaw === null || nameRaw === undefined ? '' : String(nameRaw).trim();
          const subjectGroupStr =
            subjectGroupRaw === null || subjectGroupRaw === undefined ? null : String(subjectGroupRaw).trim();
          const subjectStr =
            subjectRaw === null || subjectRaw === undefined ? null : String(subjectRaw).trim();
          const roleStr = hasRole ? normalizeTeacherRole(roleRaw, roles) : null;
          const emailStr = emailRaw === null || emailRaw === undefined ? null : String(emailRaw).trim();
          const availableBool = hasAvailable ? parseYesNoBool(availableRaw) : null;
          const eeBool = hasEE ? parseYesNoBool(eeRaw) : null;
          const pisoZeroBool = hasPisoZero ? parseYesNoBool(pisoZeroRaw) : null;

          return {
            name: nameStr,
            subject_group: subjectGroupStr,
            subject: subjectStr,
            role: roleStr,
            email: emailStr,
            available: availableBool,
            EE: eeBool,
            PISO_ZERO: pisoZeroBool,
            unavailabilities: unavailParsed.value,
            rawName: nameStr,
            hasName: isCellFilled(raw, ['Nome', 'Name', 'Professor', 'Teacher', 'Docente']),
            hasSubjectGroup,
            hasSubject,
            hasRole,
            hasEmail,
            hasAvailable,
            hasEE,
            hasPisoZero,
            hasUnavailabilities,
            invalidUnavailabilitiesText:
              unavailParsed.invalidText ? String(unavailParsed.invalidText) : null,
            rowIndex: idx + 2
          };
        });

        resolve({ rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};
