from fastapi import HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import json
import logging
import io
import pandas as pd
from datetime import datetime

from backend.models import User, InterviewData

# Configure logging
logger = logging.getLogger(__name__)


class DataService:
    """
    Service class for handling data upload and management operations.
    Encapsulates business logic related to file uploads, data parsing and database operations.
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the DataService with database session and user.

        Args:
            db (Session): SQLAlchemy database session
            user (User): Current authenticated user
        """
        self.db = db
        self.user = user

    async def upload_interview_data(
        self, file: UploadFile, is_free_text: bool = False
    ) -> dict:
        """
        Process uploaded interview data file (JSON or free-text).

        Args:
            file (UploadFile): Uploaded file object
            is_free_text (bool): Whether the file contains free-text format (not JSON)

        Returns:
            dict: Result with data_id, success status and message

        Raises:
            HTTPException: For invalid file formats or other errors
        """
        import logging

        logger = logging.getLogger(__name__)

        logger.info(
            f"[DataService] Processing file upload: {file.filename}, is_free_text={is_free_text}"
        )
        logger.info(
            f"[DataService] File details - Content-Type: {file.content_type}, Headers: {file.headers}"
        )

        try:
            # Verify file is not None and has a filename
            if not file or not hasattr(file, "filename") or not file.filename:
                logger.error("[DataService] Invalid file object")
                raise HTTPException(
                    status_code=400,
                    detail="Invalid file object. Please ensure you're uploading a valid file.",
                )

            # Read file content with error handling
            try:
                content = await file.read()
                logger.info(
                    f"[DataService] Successfully read file content, size: {len(content)} bytes"
                )

                # Check if file is empty
                if not content:
                    logger.error("[DataService] Empty file content")
                    raise HTTPException(
                        status_code=400, detail="The uploaded file is empty."
                    )
            except Exception as read_error:
                logger.error(
                    f"[DataService] Error reading file content: {str(read_error)}"
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to read file content: {str(read_error)}",
                )

            # Determine input type based on file extension and is_free_text flag
            file_extension = ""
            try:
                if "." in file.filename:
                    file_extension = file.filename.split(".")[-1].lower()
                logger.info(f"[DataService] File extension: {file_extension}")
            except Exception as ext_error:
                logger.error(
                    f"[DataService] Error extracting file extension: {str(ext_error)}"
                )
                # Continue with empty extension

            # Handle Excel files
            if file_extension in ["xlsx", "xls"]:
                logger.info(f"Processing as Excel format: {file.filename}")
                input_type, json_content = self._process_excel(content, file)
            elif is_free_text or file_extension in ["txt", "text"]:
                # Decode content for text files
                content_text = content.decode("utf-8")

                # Apply automatic interview cleaning if needed
                from backend.utils.interview_cleaner import clean_interview_content

                cleaned_content, cleaning_metadata = clean_interview_content(
                    content_text, file.filename
                )

                if cleaning_metadata:
                    logger.info(
                        f"Applied automatic interview cleaning to {file.filename}"
                    )
                    logger.info(
                        f"Processed {cleaning_metadata['interviews_processed']} interviews, "
                        f"extracted {cleaning_metadata['dialogue_lines_extracted']} dialogue lines"
                    )
                    content_text = cleaned_content

                logger.info(f"Processing as free-text format: {file.filename}")
                input_type, json_content = self._process_free_text(content_text, file)
            else:
                # Attempt to parse as JSON
                try:
                    content_text = content.decode("utf-8")
                    data = json.loads(content_text)
                except (UnicodeDecodeError, json.JSONDecodeError):
                    # If JSON parsing fails but user didn't specify free-text, try Excel as fallback
                    if file_extension in ["xlsx", "xls", "csv"]:
                        logger.info(
                            f"Attempting to process as Excel/CSV: {file.filename}"
                        )
                        input_type, json_content = self._process_excel(content, file)
                    elif file_extension not in ["txt", "text"]:
                        raise HTTPException(
                            status_code=400,
                            detail="Invalid file format. Please upload a valid JSON, Excel, or text file.",
                        )
                    else:
                        # Treat as free text
                        logger.info(
                            f"JSON parsing failed, treating as free-text format: {file.filename}"
                        )
                        content_text = content.decode("utf-8", errors="ignore")

                        # Apply automatic interview cleaning if needed
                        from backend.utils.interview_cleaner import (
                            clean_interview_content,
                        )

                        cleaned_content, cleaning_metadata = clean_interview_content(
                            content_text, file.filename
                        )

                        if cleaning_metadata:
                            logger.info(
                                f"Applied automatic interview cleaning to {file.filename}"
                            )
                            logger.info(
                                f"Processed {cleaning_metadata['interviews_processed']} interviews, "
                                f"extracted {cleaning_metadata['dialogue_lines_extracted']} dialogue lines"
                            )
                            content_text = cleaned_content

                        input_type, json_content = self._process_free_text(
                            content_text, file
                        )
                else:
                    # Determine JSON input type
                    if isinstance(data, list):
                        input_type = "json_array"
                    elif isinstance(data, dict):
                        input_type = "json_object"
                    else:
                        raise HTTPException(
                            status_code=400,
                            detail="Unsupported JSON structure. Expected array or object.",
                        )
                    json_content = content_text

            # Save to database
            interview_data = self._create_interview_data_record(
                filename=file.filename, input_type=input_type, json_content=json_content
            )

            logger.info(
                f"Data uploaded successfully for user {self.user.user_id}. Data ID: {interview_data.data_id}"
            )

            # Return response
            return {
                "success": True,
                "message": "Data uploaded successfully",
                "data_id": interview_data.data_id,
            }

        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            logger.error(f"Error uploading data: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

    def _process_excel(self, content: bytes, file: UploadFile) -> tuple:
        """
        Process Excel file content and convert to JSON format.

        Args:
            content (bytes): Binary content of the Excel file
            file (UploadFile): The uploaded file object

        Returns:
            tuple: (input_type, json_content)
        """
        try:
            # Create a BytesIO object from the content
            excel_file = io.BytesIO(content)

            # Read Excel file into a pandas DataFrame
            df = pd.read_excel(excel_file)

            # Convert DataFrame to a list of dictionaries (records)
            records = df.to_dict(orient="records")

            # Create a list of question-answer pairs that the NLP processor can understand
            qa_pairs = []

            # First, identify column names to use as questions
            columns = list(df.columns)

            # For each row in the Excel file
            for record in records:
                # Skip empty rows
                if all(pd.isna(value) for value in record.values()):
                    continue

                # For each column in the row
                for col in columns:
                    # Skip empty cells
                    if pd.isna(record[col]):
                        continue

                    # Create a question-answer pair
                    qa_pair = {"question": str(col), "answer": str(record[col])}
                    qa_pairs.append(qa_pair)

            # Create a format that the NLP processor can understand
            # The NLP processor expects a list of dictionaries with 'question' and 'answer' keys
            data = qa_pairs

            # If no Q&A pairs were created, create a fallback text representation
            if not qa_pairs:
                # Convert DataFrame to text
                text_parts = []

                # Add column headers
                headers = list(df.columns)
                text_parts.append(" | ".join([str(h) for h in headers]))
                text_parts.append("-" * 80)  # Separator line

                # Add each row
                for _, row in df.iterrows():
                    if row.isna().all():
                        continue
                    row_text = " | ".join(
                        [str(val) if not pd.isna(val) else "" for val in row]
                    )
                    text_parts.append(row_text)

                # Create a text representation
                text = "\n".join(text_parts)

                # Create a list with a single item that has a 'text' field
                data = [{"text": text}]

            # Add metadata about the file
            metadata = {
                "filename": file.filename,
                "content_type": file.content_type,
                "sheet_name": "Sheet1",  # Default sheet name
                "column_count": len(df.columns),
                "row_count": len(df),
                "qa_pair_count": len(qa_pairs),
            }

            # Add metadata to the data list if it's not empty
            if data:
                if (
                    isinstance(data, list)
                    and isinstance(data[0], dict)
                    and "text" not in data[0]
                ):
                    # For Q&A pairs, add metadata as a separate item
                    data.append({"metadata": metadata})
                elif (
                    isinstance(data, list)
                    and isinstance(data[0], dict)
                    and "text" in data[0]
                ):
                    # For text representation, add metadata to the text item
                    data[0]["metadata"] = metadata

            # Store as JSON string for consistency in storage
            json_content = json.dumps(data)
            input_type = "excel_data"

            logger.info(
                f"Successfully processed Excel file {file.filename} with {len(df)} rows and {len(df.columns)} columns, created {len(qa_pairs)} Q&A pairs"
            )
            return input_type, json_content

        except Exception as e:
            logger.error(f"Error processing Excel file: {str(e)}")
            raise HTTPException(
                status_code=400, detail=f"Failed to process Excel file: {str(e)}"
            )

    # We've removed the _excel_file_to_text and _excel_to_text methods as they're no longer needed

    def _process_free_text(self, content_text: str, file: UploadFile) -> tuple:
        """
        Process content as free-text and prepare for storage.

        Args:
            content_text (str): Text content of the file
            file (UploadFile): The uploaded file object

        Returns:
            tuple: (input_type, json_content)
        """
        # Create a consistent data structure for free text
        # The NLP processor expects either a list of dictionaries with 'question' and 'answer' keys,
        # or a dictionary with a 'text' field

        # For Excel files, create a structure that the NLP processor can understand
        if file.filename.endswith((".xlsx", ".xls")):
            # Create a list with a single item that has a 'text' field
            data = [{"text": content_text}]
            logger.info(f"Processed Excel file as text: {file.filename}")
        else:
            # For regular text files, use the standard format
            data = {
                "free_text": content_text,
                "metadata": {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "is_free_text": True,
                    # Add a flag for Problem_demo files to help with special handling
                    "is_problem_demo": (
                        "Problem_demo" in file.filename if file.filename else False
                    ),
                },
            }
            logger.info(f"Processed text file: {file.filename}")
            if "Problem_demo" in file.filename:
                logger.info(
                    f"Detected Problem_demo file: {file.filename}. Adding special handling flag."
                )

        # Store as JSON string for consistency in storage
        json_content = json.dumps(data)
        input_type = "free_text"

        return input_type, json_content

    def _create_interview_data_record(
        self, filename: str, input_type: str, json_content: str
    ) -> InterviewData:
        """
        Create and save InterviewData record in database.

        Args:
            filename (str): Name of the uploaded file
            input_type (str): Type of data (free_text, json_array, json_object)
            json_content (str): JSON string of the content

        Returns:
            InterviewData: The created record
        """
        interview_data = InterviewData(
            user_id=self.user.user_id,
            filename=filename,
            input_type=input_type,
            original_data=json_content,
        )

        self.db.add(interview_data)
        self.db.commit()
        self.db.refresh(interview_data)

        return interview_data
