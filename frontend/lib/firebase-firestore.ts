'use client';

import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  setDoc
} from 'firebase/firestore';

/**
 * Firebase Firestore utility functions
 * These functions provide a simplified interface for common Firestore operations
 */

/**
 * Add a document to a collection
 * 
 * @param collectionName The name of the collection
 * @param data The data to add
 * @returns A promise that resolves to the ID of the new document
 */
export async function addDocument(
  collectionName: string,
  data: Record<string, any>
): Promise<string> {
  try {
    // Add a timestamp field
    const dataWithTimestamp = {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Add the document to the collection
    const docRef = await addDoc(collection(db, collectionName), dataWithTimestamp);
    return docRef.id;
  } catch (error) {
    console.error(`Error adding document to ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Set a document with a specific ID
 * 
 * @param collectionName The name of the collection
 * @param docId The ID of the document
 * @param data The data to set
 * @param merge Whether to merge the data with existing data
 * @returns A promise that resolves when the document is set
 */
export async function setDocument(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  merge: boolean = false
): Promise<void> {
  try {
    // Add a timestamp field
    const dataWithTimestamp = {
      ...data,
      updatedAt: serverTimestamp()
    };
    
    // If creating a new document, add createdAt
    if (!merge) {
      dataWithTimestamp.createdAt = serverTimestamp();
    }
    
    // Set the document
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, dataWithTimestamp, { merge });
  } catch (error) {
    console.error(`Error setting document ${docId} in ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Get a document by ID
 * 
 * @param collectionName The name of the collection
 * @param docId The ID of the document
 * @returns A promise that resolves to the document data or null if not found
 */
export async function getDocument(
  collectionName: string,
  docId: string
): Promise<Record<string, any> | null> {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error getting document ${docId} from ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Update a document
 * 
 * @param collectionName The name of the collection
 * @param docId The ID of the document
 * @param data The data to update
 * @returns A promise that resolves when the document is updated
 */
export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Record<string, any>
): Promise<void> {
  try {
    // Add an updatedAt timestamp
    const dataWithTimestamp = {
      ...data,
      updatedAt: serverTimestamp()
    };
    
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, dataWithTimestamp);
  } catch (error) {
    console.error(`Error updating document ${docId} in ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Delete a document
 * 
 * @param collectionName The name of the collection
 * @param docId The ID of the document
 * @returns A promise that resolves when the document is deleted
 */
export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Error deleting document ${docId} from ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Query documents in a collection
 * 
 * @param collectionName The name of the collection
 * @param conditions An array of condition objects with field, operator, and value
 * @param orderByField The field to order by
 * @param orderDirection The direction to order by ('asc' or 'desc')
 * @param limitCount The maximum number of documents to return
 * @param startAfterDoc The document to start after for pagination
 * @returns A promise that resolves to an array of documents
 */
export async function queryDocuments(
  collectionName: string,
  conditions: Array<{ field: string; operator: string; value: any }> = [],
  orderByField: string = 'createdAt',
  orderDirection: 'asc' | 'desc' = 'desc',
  limitCount: number = 50,
  startAfterDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ documents: Array<Record<string, any>>; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  try {
    // Create a reference to the collection
    const collectionRef = collection(db, collectionName);
    
    // Build the query
    let q = query(collectionRef);
    
    // Add conditions
    conditions.forEach(condition => {
      q = query(q, where(condition.field, condition.operator as any, condition.value));
    });
    
    // Add ordering
    q = query(q, orderBy(orderByField, orderDirection));
    
    // Add pagination
    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }
    
    // Add limit
    q = query(q, limit(limitCount));
    
    // Execute the query
    const querySnapshot = await getDocs(q);
    
    // Extract the documents
    const documents: Array<Record<string, any>> = [];
    querySnapshot.forEach(doc => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    
    // Get the last document for pagination
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
    
    return { documents, lastDoc };
  } catch (error) {
    console.error(`Error querying documents from ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Subscribe to real-time updates for a document
 * 
 * @param collectionName The name of the collection
 * @param docId The ID of the document
 * @param callback The callback function to call when the document changes
 * @returns A function to unsubscribe from updates
 */
export function subscribeToDocument(
  collectionName: string,
  docId: string,
  callback: (data: Record<string, any> | null) => void
): () => void {
  const docRef = doc(db, collectionName, docId);
  
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() });
    } else {
      callback(null);
    }
  }, (error) => {
    console.error(`Error subscribing to document ${docId} in ${collectionName}:`, error);
    callback(null);
  });
  
  return unsubscribe;
}

/**
 * Subscribe to real-time updates for a query
 * 
 * @param collectionName The name of the collection
 * @param conditions An array of condition objects with field, operator, and value
 * @param callback The callback function to call when the query results change
 * @returns A function to unsubscribe from updates
 */
export function subscribeToQuery(
  collectionName: string,
  conditions: Array<{ field: string; operator: string; value: any }> = [],
  callback: (documents: Array<Record<string, any>>) => void
): () => void {
  // Create a reference to the collection
  const collectionRef = collection(db, collectionName);
  
  // Build the query
  let q = query(collectionRef);
  
  // Add conditions
  conditions.forEach(condition => {
    q = query(q, where(condition.field, condition.operator as any, condition.value));
  });
  
  // Subscribe to the query
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const documents: Array<Record<string, any>> = [];
    querySnapshot.forEach(doc => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    callback(documents);
  }, (error) => {
    console.error(`Error subscribing to query in ${collectionName}:`, error);
    callback([]);
  });
  
  return unsubscribe;
}
