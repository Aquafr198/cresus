use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use cresus_core::wallet::manager::WalletError;
use cresus_core::token::mint::MintError;
use cresus_core::bundle::builder::BundleError;
use cresus_core::distribution::disperser::DistributionError;
use cresus_core::token::vanity::VanityError;
use cresus_core::meme::manager::MemeError;

/// Unified API error type for all handlers.
#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub message: String,
}

impl AppError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }

    pub fn payload_too_large(message: impl Into<String>) -> Self {
        Self::new(StatusCode::PAYLOAD_TOO_LARGE, message)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = json!({
            "success": false,
            "error": self.message,
        });
        (self.status, Json(body)).into_response()
    }
}

impl From<WalletError> for AppError {
    fn from(e: WalletError) -> Self {
        match &e {
            WalletError::Locked => Self::forbidden(e.to_string()),
            WalletError::NotFound => Self::not_found(e.to_string()),
            WalletError::InvalidPassword => Self::unauthorized(e.to_string()),
            WalletError::PasswordAlreadySet => Self::conflict(e.to_string()),
            WalletError::NoPasswordConfigured => {
                Self::new(StatusCode::PRECONDITION_REQUIRED, e.to_string())
            }
            _ => {
                tracing::error!("Wallet error: {:?}", e);
                Self::internal("Internal error")
            }
        }
    }
}

impl From<MintError> for AppError {
    fn from(e: MintError) -> Self {
        match &e {
            MintError::Locked => Self::forbidden(e.to_string()),
            MintError::WalletNotFound => Self::not_found(e.to_string()),
            _ => {
                tracing::error!("Mint error: {:?}", e);
                Self::internal(e.to_string())
            }
        }
    }
}

impl From<BundleError> for AppError {
    fn from(e: BundleError) -> Self {
        match &e {
            BundleError::Locked => Self::forbidden(e.to_string()),
            BundleError::WalletNotFound(_) => Self::not_found(e.to_string()),
            _ => {
                tracing::error!("Bundle error: {:?}", e);
                Self::internal(e.to_string())
            }
        }
    }
}

impl From<DistributionError> for AppError {
    fn from(e: DistributionError) -> Self {
        match &e {
            DistributionError::Locked => Self::forbidden(e.to_string()),
            DistributionError::WalletNotFound(_) => Self::not_found(e.to_string()),
            _ => {
                tracing::error!("Distribution error: {:?}", e);
                Self::internal(e.to_string())
            }
        }
    }
}

impl From<VanityError> for AppError {
    fn from(e: VanityError) -> Self {
        match &e {
            VanityError::NoPattern | VanityError::InvalidChars(_) => {
                Self::bad_request(e.to_string())
            }
            _ => {
                tracing::error!("Vanity error: {:?}", e);
                Self::internal(e.to_string())
            }
        }
    }
}

impl From<MemeError> for AppError {
    fn from(e: MemeError) -> Self {
        match &e {
            MemeError::AssetNotFound | MemeError::MetadataNotFound => {
                Self::not_found(e.to_string())
            }
            _ => {
                tracing::error!("Meme error: {:?}", e);
                Self::internal(e.to_string())
            }
        }
    }
}

impl From<cresus_db::DbError> for AppError {
    fn from(e: cresus_db::DbError) -> Self {
        tracing::error!("Database error: {:?}", e);
        Self::internal("Database error")
    }
}
