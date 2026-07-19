import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase/config';

export async function uploadProductImage(file: File, tenantId: string, productId: string, onProgress?: (progress: number) => void): Promise<string> {
  if (!tenantId) throw new Error('Tenant ID is required for uploads.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Only JPG, PNG or WebP images up to 5 MB are allowed.');
  }
  const fileExtension = file.name.split('.').pop();
  const fileName = `${productId}_${Date.now()}.${fileExtension}`;
  const storageRef = ref(storage, `tenants/${tenantId}/products/${fileName}`);

  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        reject(error);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadURL);
      }
    );
  });
}

export async function deleteProductImage(imageUrl: string) {
  try {
    const fileRef = ref(storage, imageUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Error deleting image:', error);
  }
}
