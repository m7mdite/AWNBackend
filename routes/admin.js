const express=require('express');
const verifyToken = require('../Middlewares/verifyToken');
const { requireAdmin } = require('../Middlewares/roles');
const { createOverseer, getAllOverseers, assignOverseerToLesson } = require('../controllers/adminControllers/overseersController');
const { verifyAccountAccept, verifyAccountReject, getAllStudents, addCategory, getCategories, getAllVerifyRequests } = require('../controllers/adminControllers/studentsController');
const { getAllPatients } = require('../controllers/adminControllers/patientsController');
const { createCourse, getCourses, addTreatment, getAllTreatments, deleteTreatment, addPracticalLesson, getAllLessons, updatePracialLesson } = require('../controllers/adminControllers/courses_and_treatments');
const { adminUpdateInProcess } = require('../controllers/adminControllers/requestions_controller');
const { notifyAll } = require('../controllers/adminControllers/notifyController');

const router=express.Router();

// قراءة بيانات مرجعية يحتاجها المرضى والطلاب والمشرفون (قوائم العلاجات والتصنيفات والمقررات والجدول):
// تكفي هنا المصادقة فقط.
router.get('/treatment',verifyToken,getAllTreatments)
router.get('/category',verifyToken,getCategories)
router.get('/course',verifyToken,getCourses)
router.get('/practical-lessons',verifyToken,getAllLessons)

// كل ما عدا ذلك للأدمن فقط (التحقق على السيرفر)
router.use(verifyToken, requireAdmin);

// add over seer
router.post('/overseer',createOverseer);
router.put('/overseer/assign',assignOverseerToLesson)
//get verify requests
router.get('/verify',getAllVerifyRequests);
//verify account
router.post('/verify/accept/:id',verifyAccountAccept);
router.post('/verify/reject/:id',verifyAccountReject);
// get the users
router.get('/patients',getAllPatients);
router.get('/overseers',getAllOverseers);
router.get('/students',getAllStudents);

//add coures
router.post('/course',createCourse);

//treatment
router.post('/treatment',addTreatment)
router.delete('/treatment/:id',deleteTreatment)

//categories
router.post('/category',addCategory)

//practical-lessons
router.post('/practical-lessons',addPracticalLesson)
router.put('/practical-lessons/:id',updatePracialLesson)

// inprocess
router.put('/in-proccess/:id',adminUpdateInProcess)

//  notify
router.post('/notify',notifyAll)

module.exports=router
