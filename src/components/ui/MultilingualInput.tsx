'use client';

interface MultilingualInputProps {
  label: string;
  valueEn: string;
  valueUr: string;
  onChangeEn: (v: string) => void;
  onChangeUr: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
}

export function MultilingualInput({
  label,
  valueEn,
  valueUr,
  onChangeEn,
  onChangeUr,
  multiline,
  required,
}: MultilingualInputProps) {
  const base =
    'w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand';

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-subtle">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] text-muted uppercase">English</span>
          {multiline ? (
            <textarea rows={3} value={valueEn} onChange={(e) => onChangeEn(e.target.value)} className={base} />
          ) : (
            <input value={valueEn} onChange={(e) => onChangeEn(e.target.value)} className={base} />
          )}
        </div>
        <div>
          <span className="text-[10px] text-muted uppercase">اردو</span>
          {multiline ? (
            <textarea
              rows={3}
              dir="rtl"
              value={valueUr}
              onChange={(e) => onChangeUr(e.target.value)}
              className={base}
            />
          ) : (
            <input
              dir="rtl"
              value={valueUr}
              onChange={(e) => onChangeUr(e.target.value)}
              className={base}
            />
          )}
        </div>
      </div>
    </div>
  );
}
