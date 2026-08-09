import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase/config';

export async function uploadProductImage(
  file: File, 
  tenantId: string, 
  productId: string, 
  onProgress?: (progress: number) => void
): Promise<string> {
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

export async function deleteProductImage(tenantId: string, imageUrl: string) {
  try {
    // Extract the path from the full URL
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+)/);
    if (pathMatch) {
      const filePath = decodeURIComponent(pathMatch[1]);
      const fileRef = ref(storage, filePath);
      await deleteObject(fileRef);
    } else {
      console.error('Could not parse image URL path:', imageUrl);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
  }
}