# XplainAI (ReasonLens)

XplainAI is a full-stack application that provides an advanced chat interface with document upload capabilities and streaming responses. 

## 📁 Folder Structure

The repository is organized as follows:

- **`backend/`**: Contains the FastAPI application, SQLite database interactions, LangGraph workflows for AI reasoning, and API endpoints for chat, history, and document uploads.
- **`frontend/`**: Contains the React application powered by Vite, responsible for the user interface, chat interaction, and rendering workflows.
- **`notebooks/`**: Contains Jupyter notebooks (`backend_backup.ipynb`, `backend_with_rag_research.ipynb`) used for research, prototyping, and testing backend functionalities like RAG and LangGraph logic.

## 🚀 Getting Started

### Prerequisites
- Node.js & npm (for frontend)
- Python 3.9+ (for backend)

### Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up your `.env` file with the required environment variables (e.g., API keys).
4. Run the FastAPI server:
   ```bash
   python main.py
   ```
   *The backend server will run on `http://127.0.0.1:8000`.*

### Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the frontend dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

## 🛠️ Technologies Used
- **Backend:** Python, FastAPI, LangGraph, SQLite, LangChain
- **Frontend:** React, Vite, Framer Motion, D3, React Flow
