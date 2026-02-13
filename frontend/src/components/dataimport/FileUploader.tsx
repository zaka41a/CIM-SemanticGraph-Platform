import { Upload, FileText } from 'lucide-react';

interface FileUploaderProps {
  file: File | null;
  onFileChange: (file: File) => void;
  accept?: string;
}

export const FileUploader = ({ file, onFileChange, accept }: FileUploaderProps) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      onFileChange(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileChange(selectedFile);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="relative border-2 border-dashed border-primary-700/50 rounded-xl p-12 text-center hover:border-accent-500/50 transition-all bg-primary-900/30"
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept={accept}
        onChange={handleFileInput}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-accent-500/20 to-accent-600/20 rounded-2xl flex items-center justify-center">
            <Upload className="w-8 h-8 text-accent-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white mb-1">
              {file ? 'File Selected' : 'Drag & Drop or Click to Upload'}
            </p>
            <p className="text-sm text-neutral-400">
              {file ? file.name : 'Select a CIM file (XML, RDF, TURTLE) or Excel file'}
            </p>
          </div>
          {file && (
            <div className="flex items-center gap-2 px-4 py-2 bg-accent-500/10 border border-accent-500/30 rounded-lg mt-2">
              <FileText className="w-4 h-4 text-accent-400" />
              <span className="text-sm text-accent-400 font-medium">{file.name}</span>
              <span className="text-xs text-accent-300">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
        </div>
      </label>
    </div>
  );
};
