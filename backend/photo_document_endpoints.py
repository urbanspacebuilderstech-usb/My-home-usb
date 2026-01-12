class SitePhoto(BaseModel):
    photo_id: str = Field(default_factory=lambda: f"photo_{uuid.uuid4().hex[:12]}")
    project_id: str
    file_id: str
    caption: Optional[str] = None
    category: str = "progress"
    uploaded_by_user_id: str
    captured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectDocument(BaseModel):
    document_id: str = Field(default_factory=lambda: f"doc_{uuid.uuid4().hex[:12]}")
    project_id: str
    file_id: str
    title: str
    category: str
    uploaded_by_user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.post("/site-photos/upload")
async def upload_site_photo(
    project_id: str = Form(...),
    caption: str = Form(None),
    category: str = Form("progress"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    # Upload image to GridFS
    contents = await file.read()
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    # Create site photo record
    photo = SitePhoto(
        project_id=project_id,
        file_id=str(file_id),
        caption=caption,
        category=category,
        uploaded_by_user_id=user.user_id
    )
    
    photo_dict = photo.model_dump()
    photo_dict["captured_at"] = photo_dict["captured_at"].isoformat()
    photo_dict["created_at"] = photo_dict["created_at"].isoformat()
    await db.site_photos.insert_one(photo_dict)
    
    await create_audit_log(user.user_id, "upload", "site_photo", photo.photo_id, {"project_id": project_id})
    
    return photo


@api_router.get("/site-photos/{project_id}")
async def get_site_photos(project_id: str, user: User = Depends(get_current_user)):
    photos = await db.site_photos.find({"project_id": project_id}, {"_id": 0}).sort("captured_at", -1).to_list(1000)
    for photo in photos:
        if isinstance(photo.get("captured_at"), str):
            photo["captured_at"] = datetime.fromisoformat(photo["captured_at"])
        if isinstance(photo.get("created_at"), str):
            photo["created_at"] = datetime.fromisoformat(photo["created_at"])
    return photos


@api_router.post("/documents/upload")
async def upload_document(
    project_id: str = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    # Upload document to GridFS
    contents = await file.read()
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    # Create document record
    document = ProjectDocument(
        project_id=project_id,
        file_id=str(file_id),
        title=title,
        category=category,
        uploaded_by_user_id=user.user_id
    )
    
    doc_dict = document.model_dump()
    doc_dict["created_at"] = doc_dict["created_at"].isoformat()
    await db.documents.insert_one(doc_dict)
    
    await create_audit_log(user.user_id, "upload", "document", document.document_id, {"project_id": project_id, "title": title})
    
    return document


@api_router.get("/documents/{project_id}")
async def get_documents(project_id: str, user: User = Depends(get_current_user)):
    documents = await db.documents.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for doc in documents:
        if isinstance(doc.get("created_at"), str):
            doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return documents


@api_router.get("/files/{file_id}")
async def get_file(file_id: str):
    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
        return Response(content=contents, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found")