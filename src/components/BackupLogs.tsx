/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { 
  Download, 
  Upload, 
  ShieldCheck, 
  CheckCircle2, 
  FileJson, 
  AlertCircle, 
  Check 
} from 'lucide-react';

interface BackupLogsProps {
  lang: Language;
  onDownloadBackup: () => void;
  onUploadBackup: (fileContent: string) => void;
}

const localLabels = {
  pt: {
    backupTitle: "Salvaguarda & Cópias de Segurança",
    backupSubtitle: "Efetue cópias de segurança do planeador e das escalas de exames localmente de forma simples e segura.",
    cardDownloadTitle: "Exportar Dados Atuais",
    cardDownloadDesc: "Descarregue todos os registos (professores, salas, exames e escalas ativas) para um ficheiro JSON encriptado e portátil. Pode guardar este ficheiro em qualquer dispositivo.",
    cardUploadTitle: "Restaurar Cópia de Segurança",
    cardUploadDesc: "Carregue um ficheiro de salvaguarda (.json) anteriormente exportado para repor instantaneamente o planeamento para o estado guardado.",
    localSecurityTitle: "Segurança de Dados Local Garantida",
    localSecurityDesc: "Toda a computação, dados introduzidos e escalas geradas permanecem guardados exclusivamente no seu navegador (Local Storage) e no seu dispositivo local. Nenhuma informação é submetida para servidores externos de bases de dados, oferecendo a máxima privacidade e segurança corporativa.",
    dragDropText: "Arraste e solte o ficheiro JSON de backup aqui ou clique para selecionar",
    downloadBtn: "Descarregar Backup (.json)",
    uploadSuccess: "Cópia de segurança de dados restabelecida com sucesso!",
    uploadError: "Ocorreu um erro ao carregar o ficheiro. Certifique-se de que é um ficheiro JSON de backup válido.",
  },
  en: {
    backupTitle: "Backup & Data Safeguard",
    backupSubtitle: "Backup exam schedules, roster scales, rooms, and teachers locally and securely.",
    cardDownloadTitle: "Export Current Framework State",
    cardDownloadDesc: "Download all data entries (teachers, allocations, exams, and rooms) into a responsive, portable JSON format. You can store this backup on any local server or drive.",
    cardUploadTitle: "Restore Framework State",
    cardUploadDesc: "Import any previously downloaded backup file (.json) to instantly replace all variables and re-populate the planner layout.",
    localSecurityTitle: "Guaranteed Local Security & Privacy",
    localSecurityDesc: "All structural information, timetables, and teacher rosters remain fully local within your browser session (LocalStorage). No tracking analytics or third-party database nodes are utilized, ensuring complete data security compliance.",
    dragDropText: "Drag & drop backup JSON file here, or click to choose from local disk",
    downloadBtn: "Download Backup (.json)",
    uploadSuccess: "System backup state imported and applied successfully!",
    uploadError: "Failed to parse. Please confirm that the selected file is a valid JSON planner export structure.",
  }
};

export default function BackupLogs({
  lang,
  onDownloadBackup,
  onUploadBackup
}: BackupLogsProps) {
  const t = translations[lang];
  const ll = localLabels[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processBackupFile(file);
  };

  const processBackupFile = (file: File) => {
    setUploadStatus(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        // Simple sanity check
        const parsed = JSON.parse(text);
        if (parsed) {
          onUploadBackup(text);
          setUploadStatus({
            type: 'success',
            message: ll.uploadSuccess
          });
        } else {
          throw new Error('Formato inválido');
        }
      } catch (err) {
        setUploadStatus({
          type: 'error',
          message: ll.uploadError
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.json')) {
      processBackupFile(file);
    } else {
      setUploadStatus({
        type: 'error',
        message: ll.uploadError
      });
    }
  };

  return (
    <div id="backup_logs" className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{ll.backupTitle}</h2>
          <p className="text-slate-500 text-xs">{ll.backupSubtitle}</p>
        </div>
      </div>

      {uploadStatus && (
        <div 
          id="upload_feedback_banner" 
          className={`p-4 rounded-xl border flex items-start space-x-3 text-xs font-semibold max-w-4xl transition duration-150 ${
            uploadStatus.type === 'error' 
              ? 'bg-rose-50 border-rose-200 text-rose-800' 
              : 'bg-emerald-50 border-emerald-250 text-emerald-800'
          }`}
        >
          {uploadStatus.type === 'error' ? (
            <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          )}
          <div className="space-y-1">
            <p className="font-extrabold">{uploadStatus.type === 'error' ? 'Falha na Operação' : 'Sucesso'}</p>
            <p>{uploadStatus.message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        
        {/* Left Card: DOWNLOAD backup */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 border border-blue-100">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">{ll.cardDownloadTitle}</h3>
              <p className="text-[11px] text-slate-400">Offline JSON Export</p>
            </div>
          </div>

          <p className="text-slate-600 text-xs leading-relaxed">
            {ll.cardDownloadDesc}
          </p>

          <button
            id="download_state_json_btn"
            onClick={onDownloadBackup}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-3 rounded-lg transition shadow-sm cursor-pointer"
          >
            <FileJson className="h-4 w-4" />
            <span>{ll.downloadBtn}</span>
          </button>
        </div>

        {/* Right Card: UPLOAD backup */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-500 border border-indigo-100">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">{ll.cardUploadTitle}</h3>
              <p className="text-[11px] text-slate-400">Offline JSON Import</p>
            </div>
          </div>

          <p className="text-slate-600 text-xs leading-relaxed">
            {ll.cardUploadDesc}
          </p>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              isDragging 
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-800' 
                : 'border-slate-300 hover:border-slate-400 text-slate-500 bg-slate-50 hover:bg-slate-100/50'
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2.5 animate-bounce" />
            <p className="text-[11px] font-bold leading-normal px-2">
              {ll.dragDropText}
            </p>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>

      </div>

      {/* Security note card */}
      <div className="max-w-4xl bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-2">
        <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-2">
          <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
          <span>{ll.localSecurityTitle}</span>
        </h4>
        <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
          {ll.localSecurityDesc}
        </p>
      </div>

    </div>
  );
}
