import { useState, useEffect, useRef } from 'react'
import { UploadCloud, Image as ImageIcon, X, Loader2, Clipboard } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ImageUploaderProps {
  images: string[]
  onChange: (images: string[]) => void
  onUpload: (file: File) => Promise<string>
  maxImages?: number
  className?: string
}

export function ImageUploader({
  images,
  onChange,
  onUpload,
  maxImages = 10,
  className,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const processFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast.error('Vui lòng chỉ chọn hoặc dán file hình ảnh (JPG, PNG, WEBP...)')
      return
    }

    const availableSlots = maxImages - images.length
    if (availableSlots <= 0) {
      toast.error(`Đã đạt giới hạn tối đa ${maxImages} ảnh`)
      return
    }

    const filesToUpload = imageFiles.slice(0, availableSlots)
    if (imageFiles.length > availableSlots) {
      toast.warning(`Chỉ có thể tải thêm ${availableSlots} ảnh nữa (tối đa ${maxImages} ảnh)`)
    }

    setUploading(true)
    setUploadProgress(`Đang tải 0/${filesToUpload.length} ảnh...`)

    try {
      const uploadedUrls: string[] = []
      for (let i = 0; i < filesToUpload.length; i++) {
        setUploadProgress(`Đang tải ${i + 1}/${filesToUpload.length} ảnh...`)
        const url = await onUpload(filesToUpload[i])
        uploadedUrls.push(url)
      }
      onChange([...images, ...uploadedUrls])
      toast.success(`Đã thêm thành công ${uploadedUrls.length} ảnh`)
    } catch (err) {
      console.error('Lỗi khi tải ảnh:', err)
      toast.error('Có lỗi khi tải ảnh lên, vui lòng thử lại')
    } finally {
      setUploading(false)
      setUploadProgress('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only leave if leaving the target element
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (uploading) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files))
    }
  }

  // Handle Paste (Ctrl + V / Clipboard)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // If modal or page has this uploader mounted and clipboard has image data
      if (!e.clipboardData) return

      const items = Array.from(e.clipboardData.items)
      const imageItems = items.filter((item) => item.type.startsWith('image/'))

      if (imageItems.length > 0) {
        // Prevent default only if images are in clipboard
        e.preventDefault()
        const files: File[] = []
        for (const item of imageItems) {
          const file = item.getAsFile()
          if (file) files.push(file)
        }

        if (files.length > 0) {
          toast.info(`Phát hiện ${files.length} ảnh từ Clipboard...`)
          await processFiles(files)
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [images, uploading, maxImages])

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files))
    }
  }

  const removeImage = (indexToRemove: number) => {
    onChange(images.filter((_, idx) => idx !== indexToRemove))
  }

  return (
    <div ref={containerRef} className={cn('space-y-3', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        disabled={uploading || images.length >= maxImages}
      />

      {/* Dropzone Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!uploading && images.length < maxImages) {
            fileInputRef.current?.click()
          }
        }}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 select-none',
          isDragging
            ? 'border-emerald-500 bg-emerald-50/70 scale-[1.01] shadow-md ring-2 ring-emerald-400/30'
            : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/60 bg-slate-50/30',
          images.length >= maxImages && 'opacity-60 cursor-not-allowed hover:border-slate-300 hover:bg-transparent'
        )}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm font-medium text-slate-700">{uploadProgress}</p>
              <p className="text-xs text-slate-400">Vui lòng chờ trong giây lát...</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-emerald-100/80 flex items-center justify-center text-emerald-600 mb-1">
                {isDragging ? <UploadCloud className="w-5 h-5 animate-bounce" /> : <UploadCloud className="w-5 h-5" />}
              </div>
              <div className="text-sm">
                <span className="font-semibold text-emerald-600 hover:underline">Click để chọn ảnh</span>
                <span className="text-slate-600"> hoặc kéo thả ảnh vào đây</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full border border-slate-200/60">
                <Clipboard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hỗ trợ bấm <strong>Ctrl + V</strong> để dán ảnh trực tiếp từ bộ nhớ tạm</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Hỗ trợ PNG, JPG, JPEG, WEBP • Đã chọn: <strong className="text-slate-700">{images.length}/{maxImages}</strong> ảnh
              </p>
            </>
          )}
        </div>
      </div>

      {/* Thumbnails Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-2.5 pt-1">
          {images.map((url, idx) => (
            <div
              key={idx}
              className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group bg-slate-100 shadow-sm"
            >
              <img src={url} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />

              {/* Cover badge on first image */}
              {idx === 0 && (
                <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium backdrop-blur-xs">
                  Ảnh bìa
                </div>
              )}

              {/* Index badge */}
              <div className="absolute top-1 left-1 bg-slate-900/60 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-semibold">
                {idx + 1}
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeImage(idx)
                }}
                className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors shadow-sm"
                title="Xóa ảnh này"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
