use zeroize::Zeroize;

/// A wrapper around secret bytes that zeroizes memory on drop.
///
/// Use this for all secret key material to prevent key leakage
/// through uncleared memory.
pub struct SecretBytes {
    inner: Vec<u8>,
}

/// Each clone produces an independent copy that is zeroized on drop.
impl Clone for SecretBytes {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

impl Zeroize for SecretBytes {
    fn zeroize(&mut self) {
        self.inner.zeroize();
    }
}

impl Drop for SecretBytes {
    fn drop(&mut self) {
        self.zeroize();
    }
}

impl SecretBytes {
    /// Create a new `SecretBytes` from raw bytes. The input is moved,
    /// not copied, to minimize copies of secret material.
    pub fn new(bytes: Vec<u8>) -> Self {
        Self { inner: bytes }
    }

    /// Access the underlying bytes. Use sparingly — prefer passing
    /// `&SecretBytes` to functions rather than extracting the bytes.
    pub fn as_ref(&self) -> &[u8] {
        &self.inner
    }

    /// Consume and return the inner bytes.
    ///
    /// # Security Warning
    ///
    /// After calling this method, the returned `Vec<u8>` is **not**
    /// automatically zeroized on drop. The caller assumes full
    /// responsibility for zeroizing the returned bytes (e.g., by
    /// wrapping them in `Zeroizing<Vec<u8>>` or calling `.zeroize()`
    /// manually before they go out of scope).
    pub fn into_inner(self) -> Vec<u8> {
        // We use ManuallyDrop to prevent double-zeroize.
        // The caller must handle cleanup.
        let mut this = std::mem::ManuallyDrop::new(self);
        std::mem::take(&mut this.inner)
    }
}

impl std::fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_redacts() {
        let secret = SecretBytes::new(vec![1, 2, 3]);
        assert_eq!(format!("{:?}", secret), "[REDACTED]");
    }

    #[test]
    fn as_ref_works() {
        let secret = SecretBytes::new(vec![10, 20, 30]);
        assert_eq!(secret.as_ref(), &[10, 20, 30]);
    }

    #[test]
    fn into_inner_returns_correct_bytes() {
        let secret = SecretBytes::new(vec![42, 43, 44]);
        let bytes = secret.into_inner();
        assert_eq!(bytes, vec![42, 43, 44]);
    }

    #[test]
    fn clone_independence() {
        let original = SecretBytes::new(vec![1, 2, 3]);
        let cloned = original.clone();
        // Both should have the same content
        assert_eq!(original.as_ref(), cloned.as_ref());
        // Dropping clone should not affect original
        drop(cloned);
        assert_eq!(original.as_ref(), &[1, 2, 3]);
    }

    #[test]
    fn empty_secret_bytes() {
        let secret = SecretBytes::new(vec![]);
        assert!(secret.as_ref().is_empty());
        let bytes = secret.into_inner();
        assert!(bytes.is_empty());
    }
}
