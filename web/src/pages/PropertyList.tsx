import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Zap, Image as ImageIcon, X } from 'lucide-react'
import { ImageUploader } from '@/components/ui/image-uploader'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  useProperties,
  useCreateProperty,
  useUpdateProperty,
  useDeleteProperty,
  useUploadPropertyImage,
} from '@/hooks/useProperties'
import type { Property } from '@/types/database'
import { formatDate, truncate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

const propertySchema = z.object({
  title: z.string().min(5, 'Tên tối thiểu 5 ký tự'),
  raw_description: z.string().min(10, 'Mô tả tối thiểu 10 ký tự'),
  group_urls_text: z.string().optional(),
})

type PropertyFormData = z.infer<typeof propertySchema>

interface PropertyModalProps {
  property?: Property
  onClose: () => void
}

function PropertyModal({ property, onClose }: PropertyModalProps) {
  const isEdit = !!property
  const createProperty = useCreateProperty()
  const updateProperty = useUpdateProperty()
  const uploadImage = useUploadPropertyImage()
  const [images, setImages] = useState<string[]>(property?.images ?? [])

  const handleUpload = async (file: File) => {
    return await uploadImage.mutateAsync({ file, propertyId: property?.id ?? 'temp' })
  }

  const { register, handleSubmit, formState: { errors } } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      title: property?.title ?? '',
      raw_description: property?.raw_description ?? '',
      group_urls_text: property?.group_urls?.join('\n') ?? '',
    },
  })

  const onSubmit = async (data: PropertyFormData) => {
    const groupUrls = (data.group_urls_text ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    const payload = {
      title: data.title,
      raw_description: data.raw_description,
      images,
      group_urls: groupUrls,
    }
    try {
      if (isEdit && property) {
        await updateProperty.mutateAsync({ id: property.id, updates: payload })
        toast.success('Đã cập nhật bất động sản')
      } else {
        await createProperty.mutateAsync(payload)
        toast.success('Đã thêm bất động sản mới')
      }
      onClose()
    } catch {
      toast.error('Có lỗi xảy ra, vui lòng thử lại')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Chỉnh sửa bất động sản' : 'Thêm bất động sản mới'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          <div>
            <Label>Tên bất động sản <span className="text-red-500">*</span></Label>
            <Input {...register('title')} placeholder="VD: Nhà phố Tạ Quang Bửu" className="mt-1" />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <Label>Mô tả thô (AI sẽ đọc để sinh bài) <span className="text-red-500">*</span></Label>
            <Textarea
              {...register('raw_description')}
              placeholder="Nhập đầy đủ thông tin: vị trí, diện tích, số tầng, tiện ích, giá..."
              className="mt-1 h-32"
            />
            {errors.raw_description && <p className="text-red-500 text-xs mt-1">{errors.raw_description.message}</p>}
          </div>

          {/* Image Upload with Drag & Drop and Ctrl+V */}
          <div>
            <Label className="block mb-1.5">Ảnh bất động sản (Tối đa 10 ảnh)</Label>
            <ImageUploader
              images={images}
              onChange={setImages}
              onUpload={handleUpload}
              maxImages={10}
            />
          </div>

          {/* Group URLs */}
          <div>
            <Label>Danh sách link nhóm Facebook (mỗi link 1 dòng)</Label>
            <Textarea
              {...register('group_urls_text')}
              placeholder="https://www.facebook.com/groups/nhom1\nhttps://www.facebook.com/groups/nhom2"
              className="mt-1 h-24 font-mono text-xs"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Hủy</Button>
            <Button type="submit" className="flex-1" disabled={createProperty.isPending || updateProperty.isPending}>
              {createProperty.isPending || updateProperty.isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm mới'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function PropertyList() {
  const { data: properties, isLoading } = useProperties()
  const deleteProperty = useDeleteProperty()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | undefined>()

  const filtered = ((properties as Property[]) ?? []).filter((p: Property) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Xóa "${title}"? Thao tác này không thể hoàn tác.`)) return
    try {
      await deleteProperty.mutateAsync(id)
      toast.success('Đã xóa bất động sản')
    } catch {
      toast.error('Không thể xóa, vui lòng thử lại')
    }
  }

  const handleEdit = (property: Property) => {
    setEditingProperty(property)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProperty(undefined)
  }

  const handleQuickGenerate = (property: Property) => {
    navigate(`/generator?propertyId=${property.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Danh sách Bất Động Sản</h1>
          <p className="text-slate-500 text-sm mt-1">{properties?.length ?? 0} bất động sản</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-1" /> Thêm Bất Động Sản Mới
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm theo tên..."
          className="pl-9"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-slate-400" />
          </div>
          <p className="font-medium text-slate-700">{search ? 'Không tìm thấy kết quả' : 'Chưa có bất động sản nào'}</p>
          <p className="text-sm text-slate-500 mt-1">{search ? 'Thử tìm với từ khóa khác' : 'Bấm nút "Thêm" để bắt đầu'}</p>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600">Bất động sản</th>
                <th className="text-center p-4 font-medium text-slate-600">Nhóm FB</th>
                <th className="text-center p-4 font-medium text-slate-600">Bài viết</th>
                <th className="text-left p-4 font-medium text-slate-600">Ngày tạo</th>
                <th className="text-right p-4 font-medium text-slate-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((property) => (
                <tr key={property.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {property.images?.[0] ? (
                        <img
                          src={property.images[0]}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{property.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{truncate(property.raw_description, 60)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <Badge variant="secondary">{property.group_urls?.length ?? 0} nhóm</Badge>
                  </td>
                  <td className="p-4 text-center">
                    <Badge variant="info">-- bài</Badge>
                  </td>
                  <td className="p-4 text-slate-500">{formatDate(property.created_at)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleQuickGenerate(property)}
                        title="Tạo bài nhanh"
                      >
                        <Zap className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Tạo bài
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(property)}>
                        <Pencil className="w-4 h-4 text-slate-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(property.id, property.title)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PropertyModal property={editingProperty} onClose={handleCloseModal} />
      )}
    </div>
  )
}
